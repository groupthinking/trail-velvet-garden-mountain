import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Cable, Circle, Radio, Shield } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CopyBlock } from "@/components/copy-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getBridgeStatus, openTheLine, recoverBuildKey, saveBuildWebhook, saveWebhook } from "@/lib/bridge-fns";
import {
  chiefAddPrompt,
  chiefRoutinePrompt,
  grokBuildCommand,
  handshakeText,
  mcpUrl,
} from "@/lib/bridge-copy";
import { mcpTool, type ThreadRow } from "@/lib/mcp-client";
import { cn } from "@/lib/utils";

const BUILD_KEY = "cos-link.build-key";
const CHIEF_KEY = "cos-link.chief-key";

function ago(iso: string | null) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleString();
}

function clock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CosApp() {
  const qc = useQueryClient();
  const [origin, setOrigin] = useState("");
  const [buildKey, setBuildKey] = useState("");
  const [chiefKey, setChiefKey] = useState("");
  const [draft, setDraft] = useState("");
  const [wakeUrl, setWakeUrl] = useState("");
  const [wakeKey, setWakeKey] = useState("");
  const [buildWakeUrl, setBuildWakeUrl] = useState("");
  const [buildWakeKey, setBuildWakeKey] = useState("");
  const [tab, setTab] = useState<"line" | "setup">("line");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setBuildKey(localStorage.getItem(BUILD_KEY) ?? "");
    setChiefKey(localStorage.getItem(CHIEF_KEY) ?? "");
  }, []);

  const status = useQuery({
    queryKey: ["bridge-status"],
    queryFn: () => getBridgeStatus(),
    refetchInterval: 4000,
  });

  const identity = useQuery({
    queryKey: ["mcp-whoami", buildKey],
    queryFn: () => mcpTool<{ party: string }>(buildKey, "whoami"),
    enabled: Boolean(buildKey),
    retry: false,
  });

  const thread = useQuery({
    queryKey: ["mcp-thread", buildKey],
    queryFn: () => mcpTool<{ messages: ThreadRow[] }>(buildKey, "thread"),
    enabled: Boolean(buildKey) && identity.isSuccess,
    refetchInterval: 2500,
  });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread.data?.messages.length]);

  const open = useMutation({
    mutationFn: () => openTheLine(),
    onSuccess: (keys) => {
      localStorage.setItem(BUILD_KEY, keys.buildKey);
      localStorage.setItem(CHIEF_KEY, keys.chiefKey);
      setBuildKey(keys.buildKey);
      setChiefKey(keys.chiefKey);
      setTab("setup");
      toast.success("Line is open. Copy the Chief of Staff prompt next.");
      qc.invalidateQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const send = useMutation({
    mutationFn: (text: string) =>
      mcpTool<{ id: string; doorbell: string }>(buildKey, "send", { text }),
    onSuccess: (result) => {
      setDraft("");
      qc.invalidateQueries();
      if (result.doorbell === "ok") toast.success("Delivered and Chief doorbell rung.");
      else if (result.doorbell === "no-webhook") toast("Queued. Add the Chief webhook so the bot wakes.");
      else toast("Queued on the mailbox.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const webhook = useMutation({
    mutationFn: () => saveWebhook({ data: { key: buildKey, url: wakeUrl, wakeKey } }),
    onSuccess: () => {
      setWakeKey("");
      toast.success("Chief webhook saved.");
      qc.invalidateQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const buildWebhook = useMutation({
    mutationFn: () =>
      saveBuildWebhook({ data: { key: buildKey, url: buildWakeUrl, wakeKey: buildWakeKey } }),
    onSuccess: () => {
      setBuildWakeKey("");
      toast.success("Grok Build webhook saved. Chief → Build will doorbell.");
      qc.invalidateQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const recover = useMutation({
    mutationFn: (chief: string) => recoverBuildKey({ data: { chiefKey: chief } }),
    onSuccess: (keys) => {
      localStorage.setItem(BUILD_KEY, keys.buildKey);
      setBuildKey(keys.buildKey);
      toast.success("New Grok Build key issued. Chief key unchanged. Copy the CLI command in Setup.");
      qc.invalidateQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const configured = status.data?.configured ?? false;
  const ready = configured && identity.isSuccess;
  const mcp = origin ? mcpUrl(origin) : "/mcp";

  const addPrompt = useMemo(
    () => (origin && chiefKey ? chiefAddPrompt(origin, chiefKey) : ""),
    [origin, chiefKey],
  );
  const cli = useMemo(
    () => (origin && buildKey ? grokBuildCommand(origin, buildKey) : ""),
    [origin, buildKey],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
              COS Link
            </p>
            <h1 className="mt-1 font-display text-xl font-medium tracking-tight text-balance sm:text-2xl">
              Grok Build · Chief of Staff
            </h1>
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            <StatusChip
              label="Build"
              live={Boolean(status.data?.lastSeen.build)}
              detail={ago(status.data?.lastSeen.build ?? null)}
            />
            <StatusChip
              label="Chief"
              live={Boolean(status.data?.lastSeen.chief)}
              detail={ago(status.data?.lastSeen.chief ?? null)}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-0">
        <div className="flex min-h-0 flex-1 flex-col border-border lg:border-r">
          <div className="flex gap-1 border-b border-border px-4 py-2 lg:hidden">
            <TabButton active={tab === "line"} onClick={() => setTab("line")}>
              Line
            </TabButton>
            <TabButton active={tab === "setup"} onClick={() => setTab("setup")}>
              Setup
            </TabButton>
          </div>

          <section className={cn("flex min-h-0 flex-1 flex-col", tab === "setup" && "hidden lg:flex")}>
            {!configured ? (
              <EmptyOpen onOpen={() => open.mutate()} pending={open.isPending} />
            ) : !buildKey ? (
              <KeyGate
                pending={recover.isPending}
                onSubmit={(key) => {
                  setBuildKey(key);
                  localStorage.setItem(BUILD_KEY, key);
                }}
                onRecover={(chief) => recover.mutate(chief)}
              />
            ) : identity.isError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-muted">That Grok Build key is not recognized.</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    localStorage.removeItem(BUILD_KEY);
                    setBuildKey("");
                  }}
                >
                  Try another key
                </Button>
              </div>
            ) : (
              <>
                <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                  {thread.isError ? (
                    <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
                      <p className="text-sm text-muted">Could not load the mailbox.</p>
                      <p className="mt-1 max-w-sm text-xs text-subtle">{String(thread.error)}</p>
                    </div>
                  ) : thread.data?.messages.length ? (
                    <ol className="space-y-4">
                      {thread.data.messages.map((m) => {
                        const mine = m.from === "build";
                        return (
                          <li
                            key={m.id}
                            className={cn("flex", mine ? "justify-end" : "justify-start")}
                          >
                            <article
                              className={cn(
                                "max-w-[min(36rem,92%)] rounded-[var(--radius-lg)] px-4 py-3",
                                mine
                                  ? "rounded-br-[var(--radius-xs)] bg-accent text-accent-foreground"
                                  : "rounded-bl-[var(--radius-xs)] bg-elevated text-foreground",
                              )}
                            >
                              <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
                                {mine ? "Grok Build" : "Chief of Staff"} · {clock(m.createdAt)}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-pretty">
                                {m.text}
                              </p>
                            </article>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
                      <Radio className="mb-3 size-5 text-muted" />
                      <p className="text-sm text-muted">Mailbox is empty. Send the handshake.</p>
                    </div>
                  )}
                </div>
                <form
                  className="border-t border-border p-4 sm:p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = draft.trim();
                    if (!text || send.isPending) return;
                    send.mutate(text);
                  }}
                >
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message the Chief of Staff…"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        const text = draft.trim();
                        if (text) send.mutate(text);
                      }
                    }}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-subtle">⌘ / Ctrl + Enter to send</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={send.isPending || !ready}
                        onClick={() => send.mutate(handshakeText())}
                      >
                        Handshake
                      </Button>
                      <Button type="submit" disabled={send.isPending || !draft.trim()}>
                        Send
                      </Button>
                    </div>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>

        <aside
          className={cn(
            "border-t border-border bg-background px-4 py-5 sm:px-5 lg:border-t-0",
            tab === "line" && "hidden lg:block",
          )}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Setup</p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">Wire the Chief</h2>
          <p className="mt-2 text-sm leading-6 text-muted text-pretty">
            This console is Grok Build. Publish the app so the Chief of Staff bot can reach the public MCP URL, then paste the prompt into that bot.
          </p>

          <dl className="mt-5 space-y-3 text-sm">
            <Row label="MCP" value={mcp} />
            <Row
              label="Webhook"
              value={status.data?.hasWebhook ? "armed" : "not set"}
            />
            <Row
              label="Build wake"
              value={status.data?.hasBuildWebhook ? "armed" : "not set"}
            />
            <Row
              label="Unread for Chief"
              value={String(status.data?.unread.chief ?? 0)}
            />
          </dl>

          {!configured ? (
            <Button className="mt-6 w-full" onClick={() => open.mutate()} disabled={open.isPending}>
              {open.isPending ? "Opening…" : "Open the line"}
            </Button>
          ) : (
            <div className="mt-5 space-y-4">
              {chiefKey ? (
                <CopyBlock label="1. Paste into Chief of Staff bot" value={addPrompt} />
              ) : (
                <p className="text-sm text-muted">
                  The Chief key is only shown at first open. Keep it in a password manager.
                </p>
              )}
              <CopyBlock label="2. Webhook routine prompt" value={chiefRoutinePrompt()} />
              {cli ? <CopyBlock label="3. Optional: Grok Build CLI on your machine" value={cli} /> : null}

              <form
                className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-elevated p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  webhook.mutate();
                }}
              >
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                  Chief webhook
                </p>
                <Input
                  value={wakeUrl}
                  onChange={(e) => setWakeUrl(e.target.value)}
                  placeholder="https://… wake URL"
                  type="url"
                />
                <Input
                  value={wakeKey}
                  onChange={(e) => setWakeKey(e.target.value)}
                  placeholder="Wake key (optional)"
                  type="password"
                  autoComplete="off"
                />
                <Button type="submit" variant="secondary" className="w-full" disabled={webhook.isPending || !buildKey}>
                  Save webhook
                </Button>
              </form>

              <form
                className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-elevated p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  buildWebhook.mutate();
                }}
              >
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                  Grok Build webhook
                </p>
                <p className="text-[11px] leading-5 text-subtle">
                  From grok.com/automations → COS Link — Grok Build wake → copy endpoint + whsec_.
                </p>
                <Input
                  value={buildWakeUrl}
                  onChange={(e) => setBuildWakeUrl(e.target.value)}
                  placeholder="https://… Grok automation webhook"
                  type="url"
                />
                <Input
                  value={buildWakeKey}
                  onChange={(e) => setBuildWakeKey(e.target.value)}
                  placeholder="whsec_…"
                  type="password"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full"
                  disabled={buildWebhook.isPending || !buildKey || !buildWakeUrl.trim()}
                >
                  Save Build webhook
                </Button>
              </form>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  live,
  detail,
}: {
  label: string;
  live: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-elevated px-3 py-1.5">
      <Circle
        className={cn("size-2.5 fill-current", live ? "text-live" : "text-subtle")}
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-subtle">{detail}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 min-w-20 rounded-[var(--radius-sm)] px-3 text-sm",
        active ? "bg-elevated text-foreground" : "text-muted",
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[65%] break-all text-right font-mono text-[12px] text-foreground">{value}</dd>
    </div>
  );
}

function EmptyOpen({ onOpen, pending }: { onOpen: () => void; pending: boolean }) {
  return (
    <div className="flex flex-1 flex-col justify-center px-6 py-16 sm:px-10">
      <Shield className="size-6 text-muted" />
      <h2 className="mt-5 max-w-lg font-display text-3xl font-medium tracking-tight text-balance">
        A mailbox both sides can reach.
      </h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted text-pretty">
        Grok Build in this session talks through the console. Your Chief of Staff bot talks through MCP. Same keys, same thread.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg" onClick={onOpen} disabled={pending}>
          {pending ? "Opening…" : "Open the line"}
          <ArrowUpRight />
        </Button>
      </div>
      <ul className="mt-10 space-y-3 text-sm text-muted">
        <li className="flex gap-2">
          <Cable className="mt-0.5 size-4 shrink-0" />
          Generates two bearer keys. Hashed at rest. Shown once.
        </li>
        <li className="flex gap-2">
          <Radio className="mt-0.5 size-4 shrink-0" />
          MCP tools: send, inbox, status, whoami.
        </li>
      </ul>
    </div>
  );
}

function KeyGate({
  onSubmit,
  onRecover,
  pending,
}: {
  onSubmit: (key: string) => void;
  onRecover: (chiefKey: string) => void;
  pending: boolean;
}) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"build" | "chief">("build");
  const isChief = mode === "chief";
  return (
    <form
      className="flex flex-1 flex-col justify-center gap-3 px-6 py-16 sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const next = value.trim();
        if (!next || pending) return;
        if (isChief) onRecover(next);
        else onSubmit(next);
      }}
    >
      <h2 className="text-xl font-medium tracking-tight">
        {isChief ? "Mint a new Grok Build key" : "Enter the Grok Build key"}
      </h2>
      <p className="text-sm leading-6 text-muted">
        {isChief ? (
          <>
            Paste the live <span className="font-mono text-foreground">cosc_</span> Chief key. This
            issues a new <span className="font-mono text-foreground">cosb_</span> key only. The
            Chief key stays valid. Do not reopen the line.
          </>
        ) : (
          <>
            The line is already open on this app. Paste the{" "}
            <span className="font-mono text-foreground">cosb_</span> key to sit on the Build side.
          </>
        )}
      </p>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={isChief ? "cosc_…" : "cosb_…"}
        autoComplete="off"
        type="password"
      />
      <Button type="submit" disabled={!value.trim() || pending}>
        {pending ? "Minting…" : isChief ? "Mint Build key" : "Connect"}
      </Button>
      <button
        type="button"
        className="text-left text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
        onClick={() => {
          setMode(isChief ? "build" : "chief");
          setValue("");
        }}
      >
        {isChief ? "I have the Build key" : "Lost the Build key? Use the Chief key"}
      </button>
    </form>
  );
}
