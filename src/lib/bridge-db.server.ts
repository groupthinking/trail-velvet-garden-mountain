import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";

export type Party = "build" | "chief";

export type BridgeMessage = {
  id: string;
  fromParty: Party;
  toParty: Party;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type ConfigRow = {
  id: string;
  build_key_hash: string;
  chief_key_hash: string;
  chief_wake_url: string | null;
  chief_wake_key: string | null;
  build_wake_url: string | null;
  build_wake_key: string | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  from_party: string;
  to_party: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashesEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function newKey(prefix: "cosb" | "cosc") {
  return `${prefix}_${randomBytes(24).toString("hex")}`;
}

function asParty(value: string): Party {
  if (value === "build" || value === "chief") return value;
  throw new Error("Invalid party");
}

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return String(value);
}

function mapMessage(row: MessageRow): BridgeMessage {
  return {
    id: String(row.id),
    fromParty: asParty(String(row.from_party)),
    toParty: asParty(String(row.to_party)),
    body: String(row.body),
    readAt: iso(row.read_at),
    createdAt: iso(row.created_at) ?? "",
  };
}

export async function getConfig() {
  const sql = await getSql();
  const rows = await sql<ConfigRow>`select * from bridge_config where id = 'default' limit 1`;
  return rows[0] ?? null;
}

export async function isConfigured() {
  return (await getConfig()) !== null;
}

export async function setupBridge() {
  const existing = await getConfig();
  if (existing) {
    throw new Error("Line already open. Use the stored Grok Build key.");
  }
  const buildKey = newKey("cosb");
  const chiefKey = newKey("cosc");
  const sql = await getSql();
  await sql`
    insert into bridge_config (id, build_key_hash, chief_key_hash)
    values ('default', ${sha256Hex(buildKey)}, ${sha256Hex(chiefKey)})
  `;
  return { buildKey, chiefKey };
}

export async function resolveParty(key: string): Promise<Party> {
  const config = await getConfig();
  if (!config) throw new Error("Line is not open yet.");
  const hash = sha256Hex(key.trim());
  if (hashesEqual(hash, config.build_key_hash)) return "build";
  if (hashesEqual(hash, config.chief_key_hash)) return "chief";
  throw new Error("Unrecognized key.");
}

export async function touch(party: Party) {
  const sql = await getSql();
  await sql`
    insert into bridge_heartbeats (party, last_seen)
    values (${party}, now())
    on conflict (party) do update set last_seen = now()
  `;
}

export async function getStatus() {
  const sql = await getSql();
  const config = await getConfig();
  const beats = await sql<{ party: string; last_seen: string }>`
    select party, last_seen from bridge_heartbeats
  `;
  const unread = config
    ? await sql<{ to_party: string; n: number }>`
        select to_party, count(*)::int as n
        from bridge_messages
        where read_at is null
        group by to_party
      `
    : [];
  const unreadFor = (party: Party) => unread.find((row) => row.to_party === party)?.n ?? 0;
  return {
    configured: Boolean(config),
    hasWebhook: Boolean(config?.chief_wake_url),
    hasBuildWebhook: Boolean(config?.build_wake_url),
    createdAt: config?.created_at ?? null,
    lastSeen: {
      build: iso(beats.find((row) => row.party === "build")?.last_seen ?? null),
      chief: iso(beats.find((row) => row.party === "chief")?.last_seen ?? null),
    },
    unread: {
      build: unreadFor("build"),
      chief: unreadFor("chief"),
    },
  };
}

export async function listThread(limit = 120): Promise<BridgeMessage[]> {
  const sql = await getSql();
  const rows = await sql<MessageRow>`
    select id, from_party, to_party, body, read_at, created_at
    from bridge_messages
    order by created_at asc
    limit ${limit}
  `;
  return rows.map(mapMessage);
}

export async function listInbox(
  party: Party,
  limit = 40,
): Promise<BridgeMessage[]> {
  const sql = await getSql();
  const rows = await sql<MessageRow>`
    select id, from_party, to_party, body, read_at, created_at
    from bridge_messages
    where to_party = ${party} and read_at is null
    order by created_at asc
    limit ${limit}
  `;
  return rows.map(mapMessage);
}

export async function markRead(party: Party, ids?: string[]) {
  const sql = await getSql();
  if (ids && ids.length > 0) {
    for (const id of ids.slice(0, 80)) {
      await sql`
        update bridge_messages
        set read_at = now()
        where to_party = ${party}
          and read_at is null
          and id = ${id}
      `;
    }
    return;
  }
  await sql`
    update bridge_messages
    set read_at = now()
    where to_party = ${party} and read_at is null
  `;
}


export async function sendMessage(from: Party, body: string) {
  const text = body.trim();
  if (!text) throw new Error("Message is empty.");
  if (text.length > 8000) throw new Error("Message is too long (8,000 character cap).");
  const to: Party = from === "build" ? "chief" : "build";
  const id = randomBytes(16).toString("hex");
  const sql = await getSql();
  const rows = await sql<MessageRow>`
    insert into bridge_messages (id, from_party, to_party, body)
    values (${id}, ${from}, ${to}, ${text})
    returning id, from_party, to_party, body, read_at, created_at
  `;
  const message = mapMessage(rows[0]!);
  const doorbell = to === "chief" ? await ringParty("chief") : await ringParty("build");
  return { message, doorbell };
}

function standardWebhookHeaders(body: string, secret: string) {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(raw, "base64");
  const id = `msg_${randomBytes(16).toString("hex")}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${digest}`,
  };
}

async function ringParty(target: Party) {
  const config = await getConfig();
  const url = (target === "chief" ? config?.chief_wake_url : config?.build_wake_url)?.trim();
  const wakeKey = (target === "chief" ? config?.chief_wake_key : config?.build_wake_key) ?? "";
  if (!url) return "no-webhook";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "invalid-webhook";
    const body = JSON.stringify({ event: "cos-link", from: target === "chief" ? "build" : "chief" });
    const headers: Record<string, string> = wakeKey.startsWith("whsec_")
      ? standardWebhookHeaders(body, wakeKey)
      : {
          "content-type": "application/json",
          ...(wakeKey ? { authorization: `Bearer ${wakeKey}` } : {}),
        };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok ? "ok" : `http-${res.status}`;
  } catch {
    return "failed";
  }
}

export async function setChiefWebhook(
  url: string,
  wakeKey: string,
) {
  const trimmed = url.trim();
  if (trimmed) {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      throw new Error("Webhook URL must be https.");
    }
  }
  const sql = await getSql();
  await sql`
    update bridge_config
    set chief_wake_url = ${trimmed || null},
        chief_wake_key = ${wakeKey.trim() || null}
    where id = 'default'
  `;
}

export async function setBuildWebhook(url: string, wakeKey: string) {
  const trimmed = url.trim();
  if (trimmed) {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      throw new Error("Webhook URL must be https.");
    }
  }
  const sql = await getSql();
  await sql`
    update bridge_config
    set build_wake_url = ${trimmed || null},
        build_wake_key = ${wakeKey.trim() || null}
    where id = 'default'
  `;
}

export async function requireParty(key: string) {
  const party = await resolveParty(key);
  await touch(party);
  return party;
}

/** Mint a new Grok Build key. Requires the live Chief key. Does not rotate the Chief key. */
export async function rotateBuildKey(chiefKey: string) {
  const party = await resolveParty(chiefKey);
  if (party !== "chief") {
    throw new Error("Paste the Chief key (cosc_) to mint a new Grok Build key.");
  }
  const buildKey = newKey("cosb");
  const sql = await getSql();
  await sql`
    update bridge_config
    set build_key_hash = ${sha256Hex(buildKey)}
    where id = 'default'
  `;
  await touch("chief");
  return { buildKey };
}

