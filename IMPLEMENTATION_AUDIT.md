# mcp-gsc implementation audit

Repository inspected: [AminForou/mcp-gsc](https://github.com/AminForou/mcp-gsc), including its current source, dependency files, tests/issues, transports, authentication, and tool set.

## Decision: custom minimal implementation

The upstream project is useful as a local Search Console utility, but it is not a safe base for this gateway without removing much of its behavior:

- It requests the full `webmasters` scope rather than `webmasters.readonly`.
- It contains property and sitemap write/delete tools, even when runtime-disabled.
- Its primary deployment is local stdio and its remote mode is SSE; no client-to-server authorization boundary was present in the reviewed remote path.
- Google OAuth and service-account material are handled as local files, including disk token persistence.
- Its Python server is a large single module with substantially more tools than this contract requires.
- The project currently pins the pre-2.0 Python MCP SDK and has a reported period-comparison direction defect.

No upstream code was copied. This implementation uses the official Google REST contracts and the current MCP server SDK through `mcp-handler`. That produced a smaller seven-tool surface with no dormant write code and a separate OAuth gateway boundary.

## API coverage verified

| Requirement | Official API used |
|---|---|
| Properties | Search Console `sites.list` |
| Search Analytics / queries / pages / countries / devices / dates / search appearance | `searchanalytics.query` dimensions and filters |
| URL Inspection | `urlInspection.index.inspect` |
| Sitemaps | `sitemaps.list` |

Search appearance is passed through as a dimension/filter value rather than frozen into a local enum, because Google changes those values and has announced deprecations. URL Inspection reads the indexed version only. The Google Indexing API is intentionally absent.
