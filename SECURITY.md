# Security Policy

`eigen.beam` is an open-source project (MIT) maintained by Lucas Lingens.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities publicly. Report them privately via GitHub's [private vulnerability reporting](https://github.com/onetechgroupll/eigen-beam/security/advisories/new) with:

- affected URL, route, API endpoint or MCP tool;
- reproduction steps;
- expected vs actual behavior;
- impact assessment;
- logs/screenshots with secrets redacted.

## Supported version

The supported branch is:

```text
main
```

Production is deployed from `main` to Railway.

## Security docs

See [`docs/security.md`](docs/security.md) for the app-specific public surface map, security invariants and MCP auth model.

## Secret handling

Never commit or paste:

- `DATABASE_URL`
- `EB_MAGIC_LINK_SECRET`
- `EB_MCP_TOKEN` / `EB_MCP_TOKENS`
- `EB_OAUTH_TOKEN_SECRET`
- provider API keys such as `EB_RESEND_API_KEY`
- signed magic links or presenter cookies

Use `.env.example` for variable names and redacted examples only.
