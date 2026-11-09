# Self-hosting

eigen.beam is one Node process (SvelteKit `adapter-node`). It runs anywhere Node 22 or Docker runs. There are two modes:

| | Minimal mode | Production mode |
|---|---|---|
| Use it for | trying it out, personal use, a single team on one box | a public instance |
| `NODE_ENV` | unset | `production` |
| Decks | JSON files on disk | Postgres |
| Replays / follows | off / file | Postgres |
| Assets | local files | S3-compatible bucket |
| Mail | local outbox | Resend or Postmark |
| Required config | `ORIGIN` | see [production env](#production-env) |

Production mode **fails closed**: if Postgres, the signing secret or MCP auth are missing, the app refuses to start the affected paths and `/readyz` returns `503`.

## The one operating rule

> **Do not deploy or restart while a live presentation is running.**

Live rooms are kept in memory ([ADR 0002](adr/0002-in-memory-live-rooms.md)). A restart ends every active room. Decks, replays and follows survive in Postgres.

## Option A: Docker (minimal mode)

```bash
docker build -t eigen-beam .
docker run -d --name eigen-beam \
  -p 3000:3000 \
  -v eigenbeam-data:/data \
  -e ORIGIN=https://beam.example.com \
  -e EB_MAGIC_LINK_SECRET="$(openssl rand -hex 32)" \
  eigen-beam
```

- All state lives on the `/data` volume: decks, assets, follows and the mail outbox.
- `ORIGIN` must be the public URL people use, including scheme. Form and upload POSTs are rejected otherwise.
- Put a TLS-terminating reverse proxy in front (Caddy, nginx, Traefik). It must not buffer `text/event-stream` responses, or live sync stalls. For nginx: `proxy_buffering off;` on the app location.
- The image has a `HEALTHCHECK` against `/healthz`.

Without a mail provider, magic-link mails land in `/data/outbox` as JSON. That is fine for a single operator, not for public sign-ups.

## Option B: Docker in production mode

Add Postgres, a bucket and a mail provider, then set `NODE_ENV=production`:

```bash
docker run -d --name eigen-beam -p 3000:3000 \
  -e NODE_ENV=production \
  -e ORIGIN=https://beam.example.com \
  --env-file eigenbeam.env \
  eigen-beam
```

Run the migrations once per schema change, from a checkout with the same `DATABASE_URL`:

```bash
DATABASE_URL=postgres://... bun run db:migrate
```

## Option C: Railway

The reference instance runs on Railway; nothing in the code depends on it.

1. Create a project with a Postgres database and a bucket (Railway Buckets are S3-compatible).
2. Add a service from this repository. Railway detects the `Dockerfile`.
3. Set the [production env](#production-env). Railway's Postgres provides `DATABASE_URL`.
4. Run `bun run db:migrate` against the database (for example with `railway run bun run db:migrate`).
5. Point the [watchdog](operations.md#watchdog) at the public URL if you want scheduled health checks.

Any other platform with long-lived Node processes works the same way (Fly.io, Render, a VM). Serverless platforms do not: they cut SSE streams and lose in-memory rooms.

## Production env

Never put real values into issues, logs or docs. `.env.example` lists every variable with comments.

**Core**

```text
NODE_ENV=production
ORIGIN=https://beam.example.com
EB_MAGIC_LINK_SECRET=<random, at least 32 bytes>
```

**Postgres**

```text
EB_DECK_STORE=postgres
EB_ACTIVITY_STORE=postgres
DATABASE_URL=postgres://...
```

**Assets (any S3-compatible store)**

```text
EB_ASSET_STORE=s3
EB_BUCKET_ENDPOINT=...
EB_BUCKET_NAME=...
EB_BUCKET_REGION=auto
EB_BUCKET_PUBLIC_URL=...
EB_BUCKET_ACCESS_KEY=...
EB_BUCKET_SECRET_KEY=...
```

Path-style vs. virtual-host addressing must match your endpoint. `EB_BUCKET_PUBLIC_URL` is the base URL images are served from.

**Mail**

```text
EB_MAIL_PROVIDER=resend          # or postmark
EB_MAIL_FROM=eigen.beam <no-reply@your-verified-domain>
EB_RESEND_API_KEY=...            # or EB_POSTMARK_TOKEN
```

In production the magic-link endpoint never returns the link in its JSON response.

**MCP** (at least one token, or the OAuth issuer)

```text
EB_MCP_TOKEN=...
EB_MCP_TOKENS=token-a,token-b
EB_OAUTH_TOKEN_SECRET=...
EB_OAUTH_CLIENTS=client-id:client-secret|deck:read+room:create
```

Scopes: `deck:read`, `deck:write`, `room:create`, `asset:upload`. See [`mcp.md`](mcp.md).

**Optional AI**

```text
ANTHROPIC_API_KEY=...    # clarity pass and import re-layout; local fallback without it
OPENAI_API_KEY=...       # voice-to-slides transcription
```

## Deployment checklist

Before deploying:

```bash
bun run check
bun run verify:c1a
bun run build
```

If the schema changed: `bun run db:migrate`.

After deploying, against your instance:

```bash
EB_SMOKE_BASE=https://beam.example.com bun run smoke:ops
EB_SMOKE_BASE=https://beam.example.com bun run smoke:browser
```

`smoke:browser` and `smoke:replay` create real rooms and decks. Run them after a deploy, not on a schedule.

## Rollback

A rollback is a redeploy and also ends active rooms. Durable data stays in Postgres. If live routes break, check `/healthz`, `/readyz` and the server logs, then rerun the local production smoke (see [`testing.md`](testing.md)) against the suspected commit.
