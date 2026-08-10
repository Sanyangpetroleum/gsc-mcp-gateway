# Client connections

Use the same endpoint for every client:

```text
https://YOUR_HOST/mcp
```

The first connection opens the gateway authorization page. Enter the gateway operator password. Do not paste Google credentials into any AI client.

## ChatGPT

1. Open **Settings → Security and login → Developer mode** and enable it.
2. Open **ChatGPT Plugins**, select **+**, and add the public HTTPS `/mcp` endpoint.
3. Complete the OAuth authorization page with the gateway operator password.
4. In a new conversation, select the connector and ask: “List my Search Console properties.”

ChatGPT's current developer mode supports remote Streamable HTTP and SSE MCP servers. This service uses Streamable HTTP.

## Claude

For Claude.ai, open **Customize → Connectors**, add a custom connector using the `/mcp` URL, and complete OAuth. Workspace policy may require an Owner to add or enable the connector.

For Claude Code:

```bash
claude mcp add --transport http gsc-gateway https://YOUR_HOST/mcp
claude mcp login gsc-gateway
```

Use `/mcp` inside Claude Code to inspect connection status.

## Codex

Add the remote server to `~/.codex/config.toml`:

```toml
[mcp_servers.gsc_gateway]
url = "https://YOUR_HOST/mcp"
auth = "oauth"
required = true
default_tools_approval_mode = "writes"
```

Then run `codex mcp login gsc_gateway`. Because this gateway exposes only read-only tools, the `writes` approval mode does not introduce an automatic write path.

## Hermes and future agents

Configure the same HTTPS `/mcp` URL with OAuth authorization-code/PKCE support. If Hermes launches Claude Code or Codex as its client runtime, configure the gateway in that underlying client. No Hermes-specific backend or Google credential is required.

## Acceptance prompts

1. “List my Search Console properties.”
2. “Show performance for the last 28 complete days.”
3. “Compare the last 28 complete days with the preceding 28 and show pages with the largest click losses.”
4. “Inspect this URL using the exact matching Search Console property: …”
