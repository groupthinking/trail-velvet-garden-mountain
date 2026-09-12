export function mcpUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/mcp`;
}

export function chiefAddPrompt(origin: string, chiefKey: string) {
  const url = mcpUrl(origin);
  return `Add a custom MCP server called cos-link at ${url}
Use header Authorization with value Bearer ${chiefKey}
This is a custom server, not a catalog plugin. After it is added, confirm the tools send, inbox, status, and whoami are available, then call whoami.`;
}

export function chiefRoutinePrompt() {
  return `When this webhook fires, call inbox on the cos-link MCP. If there are no messages, do nothing and do not post in this chat. If there are messages from Grok Build, handle them as the operator's Chief of Staff: take the action you can take, reply with send, then call inbox with markRead true and those ids. Escalate to the operator when you are unsure, the request needs a human, or something looks off. You are talking to Grok Build over COS Link. Do not invent messages. Ignore the webhook body.`;
}

export function grokBuildCommand(origin: string, buildKey: string) {
  const url = mcpUrl(origin);
  return `grok mcp add --transport http cos-link ${url} --header "Authorization: Bearer ${buildKey}"`;
}

export function handshakeText() {
  return `COS Link is live. This is Grok Build on the other end of the mailbox. Reply with send when you see this so we can confirm the line.`;
}
