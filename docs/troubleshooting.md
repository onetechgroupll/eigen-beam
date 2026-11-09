# Troubleshooting

## Local build starts but `node build` cannot find a chunk

Symptom:

```text
ERR_MODULE_NOT_FOUND ... build/server/chunks/chunks/...
```

Fix with a clean build:

```bash
rm -rf build .svelte-kit/output .svelte-kit/generated
bun run build
```

Then restart `node build`.

If a clean build still creates `build/server/chunks 2/nodes` while the manifest
imports `build/server/chunks/nodes`, `bun run build` now runs
`scripts/repair-adapter-node-build.mjs` after Vite. The script materialises the
expected node chunks and fails fast if any manifest import is still unresolved.

## Playwright browser is missing

Symptom: browser/mobile smokes fail before loading the app.

Fix:

```bash
bunx playwright install --with-deps chromium webkit
```

For CI, the workflows install Chromium for fast smokes and Chromium+WebKit for Mobile QA Lab.

## `/readyz` is not ready in production

Check mode labels in the JSON response; do not print secrets. Common causes:

- `ORIGIN` not set to the production URL;
- `EB_MAGIC_LINK_SECRET` missing;
- `EB_DECK_STORE` or `EB_ACTIVITY_STORE` not set to `postgres`;
- `DATABASE_URL` missing/unreachable;
- S3/Railway Bucket env incomplete;
- mail provider env incomplete;
- MCP auth token env missing.

See [`deployment.md`](deployment.md) and [`eigenbeam-ops.md`](eigenbeam-ops.md).

## MCP returns `401`

Check that one of these is configured:

```text
EB_MCP_TOKEN
EB_MCP_TOKENS
```

For OAuth client-credentials, also check:

```text
EB_OAUTH_TOKEN_SECRET
EB_OAUTH_CLIENTS
```

Run:

```bash
bun run smoke:mcp
```

## Magic-Link mail does not arrive

Local default is outbox JSON files, not real mail:

```text
EB_MAIL_PROVIDER=outbox
```

Production requires verified sender config and provider key:

```text
EB_MAIL_PROVIDER=resend
EB_MAIL_FROM=...
EB_RESEND_API_KEY=...
```

Production JSON must not return the Magic-Link itself.

## WebKit reports an EventSource abort while navigating

The Mobile QA Lab narrowly ignores the expected WebKit pageerror when navigating away from a live presenter SSE stream quickly:

```text
EventSource cannot load ... /present/:id/events due to access control checks
```

Do not broaden this ignore without a concrete reproduction. Other console/page errors should still fail QA.

## A deploy killed a live room

This is expected with in-memory live rooms. Decks/replays/follows are durable, but active room state is not. Operational rule:

> Do not deploy/restart during a real live presentation.

## Import endpoint returns an unexpected 500

Broken files should surface as visible import errors and should not produce a server 500. Run:

```bash
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:browser
```

The browser smoke covers the broken-PDF negative path.

## GitHub Actions workflow changed

After editing workflows:

1. validate YAML locally;
2. push;
3. run `gh run watch --exit-status` for push/PR workflows;
4. manually trigger one representative `workflow_dispatch` run if changed.
