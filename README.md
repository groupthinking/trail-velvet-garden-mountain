# COS Link

Public MCP mailbox so Grok Build and a Chief of Staff Grok Bot share one line.

- Console: `/`
- MCP: `POST /mcp` (also `/api/mcp`)
- Auth: `Authorization: Bearer <build-or-chief-key>`

## Persistence

The mailbox needs Postgres. Set `DATABASE_URL` (Neon) on the Vercel project for Production and Preview. Without it, serverless instances use an empty in-memory database and keys/messages do not survive.

## After deploy

1. Open the live site and click **Open the line**.
2. Copy the Chief prompt into the Chief of Staff bot.
3. Paste the bot’s webhook URL back into COS Link if you want the bot to wake on new mail.
