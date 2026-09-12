import {
  isConfigured,
  listInbox,
  listThread,
  markRead,
  requireParty,
  sendMessage,
  getStatus,
  type Party,
} from "@/lib/bridge-db.server";

const PROTOCOL = "2025-03-26";
const SERVER_INFO = { name: "cos-link", version: "1.0.0" };

type Rpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers":
      "authorization, content-type, accept, mcp-protocol-version, mcp-session-id",
    "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
  };
}

function json(body: unknown, status = 200, extra?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "mcp-protocol-version": PROTOCOL,
      ...corsHeaders(),
      ...extra,
    },
  });
}

function rpcResult(id: Rpc["id"], result: unknown) {
  return json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: Rpc["id"], code: number, message: string, status = 200) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);
}

function tools() {
  return [
    {
      name: "send",
      description:
        "Send a message to the other party on COS Link. Grok Build ↔ Chief of Staff. The body is stored in the shared mailbox. If you are the Chief of Staff bot, this delivers to Grok Build. If you are Grok Build, this delivers to the Chief of Staff bot and rings their webhook if configured.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Message body, max 8000 characters." },
        },
        required: ["text"],
      },
    },
    {
      name: "inbox",
      description:
        "List unread messages addressed to you. Does not mark them read unless markRead is true. After handling, call again with markRead true and the ids.",
      inputSchema: {
        type: "object",
        properties: {
          markRead: {
            type: "boolean",
            description: "If true, mark returned (or specified) messages read.",
          },
          ids: {
            type: "array",
            items: { type: "string" },
            description: "Optional message ids to mark read. If omitted and markRead is true, marks all unread.",
          },
          limit: { type: "number", description: "Max unread to return. Default 40." },
        },
      },
    },
    {
      name: "status",
      description: "Line health: who you are, last seen, unread counts, webhook configured.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "thread",
      description:
        "Full mailbox thread (both directions), oldest first. Use this to render the conversation, not just unread.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max messages. Default 120." },
        },
      },
    },
    {
      name: "whoami",
      description: "Return which party this bearer key is: build (Grok Build) or chief (Chief of Staff bot).",
      inputSchema: { type: "object", properties: {} },
    },
  ];
}

function bearerFrom(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? "";
}

async function callTool(party: Party, name: string, args: Record<string, unknown>) {
  if (name === "send") {
    const text = String(args.text ?? "");
    const result = await sendMessage(party, text);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              id: result.message.id,
              to: result.message.toParty,
              doorbell: result.doorbell,
              createdAt: result.message.createdAt,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  if (name === "inbox") {
    const mark = Boolean(args.markRead);
    const ids = Array.isArray(args.ids) ? args.ids.map(String) : undefined;
    const limit = typeof args.limit === "number" ? args.limit : 40;
    const messages = await listInbox(party, limit);
    if (mark) await markRead(party, ids);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              count: messages.length,
              messages: messages.map((m) => ({
                id: m.id,
                from: m.fromParty,
                text: m.body,
                createdAt: m.createdAt,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  if (name === "status") {
    const status = await getStatus();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ you: party, ...status }, null, 2),
        },
      ],
    };
  }
  if (name === "thread") {
    const limit = typeof args.limit === "number" ? args.limit : 120;
    const messages = await listThread(limit);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              you: party,
              count: messages.length,
              messages: messages.map((m) => ({
                id: m.id,
                from: m.fromParty,
                to: m.toParty,
                text: m.body,
                readAt: m.readAt,
                createdAt: m.createdAt,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  if (name === "whoami") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              party,
              role: party === "build" ? "Grok Build" : "Chief of Staff",
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handleRpc(party: Party, msg: Rpc): Promise<Response> {
  const id = msg.id;
  const method = msg.method ?? "";
  const isNotification = id === undefined;

  if (method === "initialize") {
    if (isNotification) return new Response(null, { status: 202, headers: corsHeaders() });
    const requested =
      typeof msg.params?.protocolVersion === "string"
        ? msg.params.protocolVersion
        : PROTOCOL;
    return rpcResult(id, {
      protocolVersion: requested || PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "COS Link mailbox. Use inbox to read unread messages, send to reply, status for health. After handling inbox items, call inbox with markRead true and those ids.",
    });
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return new Response(null, { status: 202, headers: corsHeaders() });
  }
  if (method === "ping") {
    if (isNotification) return new Response(null, { status: 202, headers: corsHeaders() });
    return rpcResult(id, {});
  }
  if (method === "tools/list") {
    return rpcResult(id, { tools: tools() });
  }
  if (method === "tools/call") {
    const name = String(msg.params?.name ?? "");
    const args =
      msg.params?.arguments && typeof msg.params.arguments === "object"
        ? (msg.params.arguments as Record<string, unknown>)
        : {};
    try {
      const result = await callTool(party, name, args);
      return rpcResult(id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool failed";
      return rpcResult(id, {
        isError: true,
        content: [{ type: "text", text: message }],
      });
    }
  }
  if (method === "resources/list" || method === "prompts/list") {
    const key = method === "resources/list" ? "resources" : "prompts";
    return rpcResult(id, { [key]: [] });
  }
  if (isNotification) {
    return new Response(null, { status: 202, headers: corsHeaders() });
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method === "DELETE") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method === "GET") {
    const accept = request.headers.get("accept") ?? "";
    if (accept.includes("text/event-stream")) {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(": cos-link\n\n"));
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          ...corsHeaders(),
        },
      });
    }
    const configured = await isConfigured();
    return json({
      name: "cos-link",
      transport: "streamable-http",
      configured,
      tools: ["send", "inbox", "thread", "status", "whoami"],
    });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
  }

  if (!(await isConfigured())) {
    return json({ error: "Line is not open. Generate keys in COS Link first." }, 503);
  }

  const token = bearerFrom(request);
  if (!token) {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Missing Bearer token." } },
      401,
      { "www-authenticate": 'Bearer realm="cos-link"' },
    );
  }

  let party: Party;
  try {
    party = await requireParty(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message } },
      401,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return rpcError(null, -32700, "Invalid JSON", 400);
  }

  if (Array.isArray(payload)) {
    const parts: unknown[] = [];
    for (const item of payload) {
      const res = await handleRpc(party, (item ?? {}) as Rpc);
      if (res && res.status === 200) {
        parts.push(await res.json());
      }
    }
    return json(parts);
  }

  const res = await handleRpc(party, (payload ?? {}) as Rpc);
  return res;
}
