# Client connections

Use the same remote MCP endpoint for every compatible client:

```text
https://YOUR_HOST/mcp
```

The gateway uses OAuth. The first authenticated connection opens the gateway authorization flow. Enter the gateway operator password there; do not paste Google service-account credentials into ChatGPT, Codex, Claude, or any other AI client.

## ChatGPT

ChatGPT support depends on plan and workspace configuration. As of September 2026, Pro users can connect read/fetch MCP apps in developer mode, while full MCP including write/modify actions is available to Business and Enterprise/Edu workspaces. This gateway is intentionally read-only.

For current ChatGPT web setup:

1. Enable Developer mode under **Settings → Apps → Advanced Settings** when available for your plan/workspace.
2. Create or add a custom app and provide the public HTTPS MCP endpoint: `https://YOUR_HOST/mcp`.
3. Choose OAuth when prompted, complete the gateway authorization flow, and allow ChatGPT to scan the available tools.
4. Start a new chat, select or mention the app, and ask: “List my Search Console properties.”

OpenAI changes the ChatGPT app UI over time. If the labels above differ, follow the current OpenAI Developer mode / MCP app documentation rather than older “Plugins” instructions.

## ChatGPT desktop / Codex desktop host

Current Codex-hosted clients support Streamable HTTP MCP servers and OAuth. In the ChatGPT desktop app where MCP server settings are available:

1. Open **Settings → MCP servers**.
2. Select **Add server**.
3. Choose **Streamable HTTP** and enter `https://YOUR_HOST/mcp`.
4. Save/restart if requested, then authenticate the server when prompted.

## Codex CLI

The most direct current setup is:

```bash
codex mcp add gsc-gateway --url https://YOUR_HOST/mcp
codex mcp login gsc-gateway
codex mcp list
```

Codex supports OAuth discovery and Dynamic Client Registration for compatible remote MCP servers. In the Codex TUI, use `/mcp` to inspect connection state.

Equivalent `~/.codex/config.toml`:

```toml
[mcp_servers.gsc-gateway]
url = "https://YOUR_HOST/mcp"
enabled = true
```

Do not add a Google credential, Google access token, or gateway operator password to `config.toml`.

## Claude Code

Claude Code recommends remote HTTP for cloud-hosted MCP servers:

```bash
claude mcp add --transport http gsc-gateway https://YOUR_HOST/mcp
```

Then use `/mcp` inside Claude Code and complete OAuth in the browser when authentication is requested. Claude Code can discover OAuth metadata from the gateway after a `401`/`403` challenge.

## Claude.ai and other MCP clients

For clients that support remote Streamable HTTP plus OAuth authorization-code/PKCE, configure the same HTTPS `/mcp` endpoint. No client needs the Google service-account credential.

## Acceptance prompts

After connecting, use these prompts to verify the read-only path:

1. “List my Search Console properties.”
2. “Show performance for the last 28 complete days.”
3. “Compare the last 28 complete days with the preceding 28 and show pages with the largest click losses.”
4. “Inspect this URL using the exact matching Search Console property: …”

A successful client connection proves MCP/OAuth connectivity. It does not by itself prove that the Google service account has access to every intended Search Console property; property grants remain configured in Google Search Console.
