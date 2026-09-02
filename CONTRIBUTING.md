# Contributing

Thanks for considering a contribution to GSC MCP Gateway.

The project is intentionally narrow: a reusable, read-only Google Search Console gateway exposed through standard remote MCP. Contributions should preserve that boundary unless a maintainer explicitly approves a broader design change.

## Development setup

Requirements:

- Node.js 22.x
- npm

Install dependencies and run the full local validation suite:

```bash
npm ci
npm run check
```

`npm run check` runs linting, TypeScript checks, the mocked test suite, and the production build. Tests mock Google APIs and should not consume Search Console quota.

## Pull requests

Keep pull requests focused and include:

1. the user or maintainer problem being solved;
2. the smallest implementation that solves it;
3. tests for changed behavior where practical;
4. any security, authentication, quota, or compatibility impact;
5. documentation updates when configuration or behavior changes.

Please avoid unrelated refactors in the same pull request.

## Security boundary

The following principles are part of the project contract:

- Google access remains read-only.
- Secrets never enter source control, logs, tool output, or browser-visible variables.
- Anonymous MCP requests remain unauthorized.
- OAuth authorization codes and tokens remain bounded and short-lived.
- Google error bodies and credentials are not exposed to clients.
- New write-capable Search Console or website mutation tools are out of scope unless the project direction changes explicitly.

Read `SECURITY.md` before changing authentication, OAuth, token storage, Google scopes, logging, or deployment configuration.

## Reporting vulnerabilities

Do not post credentials, tokens, private keys, personal data, or exploitable security details in a public issue. Use GitHub's private security-reporting / Security Advisory flow when available. For non-sensitive defects and feature requests, open a normal GitHub issue.

## Compatibility

Changes should remain compatible with standards-based OAuth-capable MCP clients. Client-specific accommodations should be isolated and documented rather than weakening the protocol or security boundary for every client.

## License

By contributing, you agree that your contribution will be licensed under the Apache License 2.0, the same license as the project.
