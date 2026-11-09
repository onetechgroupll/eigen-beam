# Deployment

Production runs on Railway as a SvelteKit `adapter-node` service.

Live URL:

```text
https://eigen-beam-production.up.railway.app
```

## Hard operating rule

> Do not deploy or restart while a real live presentation is running.

Live rooms are intentionally in-memory. A Railway restart or deploy kills active rooms, even though decks/replays/follows are durable.

## Production architecture

| Area | Production mode |
|---|---|
| Web app | SvelteKit `adapter-node` on Railway |
| Live room state | In-memory Node process |
| Deck persistence | Postgres via `EB_DECK_STORE=postgres` |
| Replay/follow persistence | Postgres via `EB_ACTIVITY_STORE=postgres` |
| Assets | Railway Buckets / S3-compatible store via `EB_ASSET_STORE=s3` |
| Mail | Resend via `EB_MAIL_PROVIDER=resend` |
| AI/MCP | Hosted `/mcp` with bearer tokens and optional OAuth client credentials |
| Health | `/healthz` cheap liveness |
| Readiness | `/readyz` secret-safe config/dependency readiness |

## Required production env

Do not print raw values in logs, tickets or docs. Use variable names only.

### Core

```text
ORIGIN=https://eigen-beam-production.up.railway.app
EB_MAGIC_LINK_SECRET=...
```

### Postgres

```text
EB_DECK_STORE=postgres
EB_ACTIVITY_STORE=postgres
DATABASE_URL=...
```

Run migrations before relying on new schema:

```bash
bun run db:migrate
```

### Assets / Railway Bucket

```text
EB_ASSET_STORE=s3
EB_BUCKET_ENDPOINT=...
EB_BUCKET_NAME=...
EB_BUCKET_REGION=auto
EB_BUCKET_PUBLIC_URL=...
EB_BUCKET_ACCESS_KEY=...
EB_BUCKET_SECRET_KEY=...
```

If using a virtual-host style endpoint, path-style behavior must match the bucket endpoint configuration.

### Mail

```text
EB_MAIL_PROVIDER=resend
EB_MAIL_FROM=eigen.beam <...verified-domain...>
EB_RESEND_API_KEY=...
```

Production magic-link JSON must not return secret-bearing login links.

### MCP

At least one MCP auth path must be configured:

```text
EB_MCP_TOKEN=...
EB_MCP_TOKENS=...
```

Optional OAuth token issuer:

```text
EB_OAUTH_TOKEN_SECRET=...
EB_OAUTH_CLIENTS=client-id:client-secret|deck:read+room:create
```

Scopes are limited to:

```text
deck:read
deck:write
room:create
asset:upload
```

## Deployment checklist

Before deploy:

```bash
bun run check
bun run verify:c1a
bun run build
```

If schema changed:

```bash
bun run db:migrate
```

After deploy:

```bash
EB_SMOKE_BASE=https://eigen-beam-production.up.railway.app bun run smoke:browser
EB_SMOKE_BASE=https://eigen-beam-production.up.railway.app bun run smoke:replay
bun run smoke:ops
bun run smoke:mcp
```

For mobile-sensitive releases, trigger the GitHub **Mobile QA Lab** workflow and inspect artifacts.

## Readiness expectations

`/readyz` should be `200` with `ok: true` in production. It checks production fail-closed configuration and durable dependencies without leaking secrets.

See [`eigenbeam-ops.md`](eigenbeam-ops.md) for endpoint details.

## Rollback notes

- A rollback/redeploy also restarts the process and ends active rooms.
- Durable decks/replays/follows remain in Postgres.
- If a deploy breaks live routes, verify `/healthz`, `/readyz`, server logs and then rerun the local production smoke shape against the suspected commit.
