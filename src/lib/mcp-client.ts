type RpcResult = {
  jsonrpc?: string;
  id?: unknown;
  result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
  error?: { message?: string };
};

export async function mcpTool<T>(
  key: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch("/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const json = (await res.json()) as RpcResult;
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `MCP ${name} failed (${res.status})`);
  }
  const text = json.result?.content?.[0]?.text ?? "{}";
  if (json.result?.isError) throw new Error(text);
  return JSON.parse(text) as T;
}

export type ThreadRow = {
  id: string;
  from: "build" | "chief";
  to: "build" | "chief";
  text: string;
  readAt: string | null;
  createdAt: string;
};
