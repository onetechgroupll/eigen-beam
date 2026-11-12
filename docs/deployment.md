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
| Required config | `ORIGIN` | see [environment](#environment) |

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
- The image has a liveness `HEALTHCHECK` against `/healthz`. Configure the platform's traffic-readiness probe against `/readyz`.

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

The image runs pending migrations before the app starts. To run only migrations, use the same image and environment:

```bash
docker run --rm --env-file eigenbeam.env eigen-beam migrate
```

Set `EB_MIGRATE_ON_BOOT=false` only when a separate release step runs that command. A migration failure stops boot with exit code 1.

## Option C: Railway

The reference instance runs on Railway; nothing in the code depends on it.

The one-click template is drafted in [`deploy/railway/template.json`](../deploy/railway/template.json), with its publishing and five-minute acceptance walkthrough in [`deploy/railway/README.md`](../deploy/railway/README.md). Until the maintainer publishes the dashboard template and inserts its ID, the README button stays commented out rather than linking to a dead deployment.

For the template path:

1. Click the published **Deploy on Railway** button. The template creates the app from `ghcr.io/onetechgroupll/eigen-beam:v0.1`, Postgres and a private Railway Bucket.
2. Provide the required `EB_RESEND_API_KEY` and `EB_MAIL_FROM` fields. Verify the `EB_MAIL_FROM` sender domain at Resend before deploying; setting an address alone is not domain verification.
3. Deploy. The template wires Postgres and Bucket variables, generates the signing and MCP secrets, applies migrations on boot and checks `/readyz` before Railway sends traffic.
4. Require the public `/readyz` endpoint to return HTTP `200` with `"ok": true`.
5. Complete the real mail acceptance: request a magic link from `/account`, confirm it arrives in the inbox, open it, and verify that login works. Readiness cannot prove external mail delivery.

To assemble or update the live dashboard template, follow the maintainer section in the template walkthrough; the JSON file is a reviewable snapshot because Railway currently hosts multi-service template definitions in its dashboard.

For a manual Railway deployment instead:

1. Create a project with a Postgres database and a bucket (Railway Buckets are S3-compatible).
2. Add a service from this repository. Railway detects the `Dockerfile`. (The image declares no Docker `VOLUME`; Railway rejects those. In production mode nothing needs a volume. For minimal mode, attach a Railway Volume at `/data`.)
3. Set the [environment](#environment). Railway's Postgres provides `DATABASE_URL`.
4. Set Railway's healthcheck path to `/readyz`; the image applies migrations before it accepts traffic.
5. Point the [watchdog](operations.md#watchdog) at the public URL if you want scheduled health checks.

Any other platform with long-lived Node processes works the same way (Fly.io, Render, a VM). Serverless platforms do not: they cut SSE streams and lose in-memory rooms.

## Environment

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
# Optional; defaults to 30 minutes (milliseconds, minimum 5000)
EB_ENDED_ROOM_TTL_MS=1800000
```

Values below 5 seconds or invalid values fall back to the 30-minute default and emit one boot warning. The ended-room sweep runs at least every 10 seconds and at most every 5 minutes.

Migration `005_replay_pin_verifier.sql` keeps only an HMAC verifier for PIN-protected replay unlocks after a restart; raw room PINs are never persisted. Only replay sessions stored after migration 005 have that verifier. Older protected rows are treated as unknown (`410`) instead of showing a PIN form that cannot succeed. The verifier is derived with `EB_MAGIC_LINK_SECRET`, so rotating that secret invalidates stored PIN verifiers and leaves those protected replays locked.

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

**Release and rollout controls**

| Variable | Default | Meaning |
|---|---:|---|
| `EB_MIGRATE_ON_BOOT` | `true` | Run pending migrations before the image starts the app. `false` delegates migrations to a separate release step. |
| `EB_OAUTH_AUTH_CODE` | `false` | Authorization-code OAuth rollout guard. Keep `false` until the supported-client matrix is green. |
| `EB_QUOTA_DECKS_PER_USER` | unset | Optional positive integer. Unset disables the per-user deck quota. |
| `EB_DEMO_DECK_TTL_DAYS` | unset | Optional positive integer. Unset disables demo-deck cleanup; default boot starts no deletion job. |
| `EB_DEFAULT_LOCALE` | `en` | Default locale when a client does not provide one. |

Boot validates the full configuration and reports every missing or invalid variable name in one secret-safe error. It also exits with code 1 if a configured local data directory is not writable.

**Optional AI**

```text
ANTHROPIC_API_KEY=...    # clarity pass and import re-layout; local fallback without it
EB_CLAUDE_MODEL=...      # optional, default claude-opus-5-5 (src/lib/server/claude.ts)
OPENAI_API_KEY=...       # voice-to-slides transcription
```

## Deployment checklist

Before deploying:

```bash
bun run check
bun run verify:c1a
bun run build
```

For a checkout-based deployment, run `bun run db:migrate`. The Docker image performs the same migration automatically unless `EB_MIGRATE_ON_BOOT=false`.

After deploying, against your instance:

```bash
EB_SMOKE_BASE=https://beam.example.com bun run smoke:ops
EB_SMOKE_BASE=https://beam.example.com bun run smoke:browser
```

`smoke:browser` and `smoke:replay` create real rooms and decks. Run them after a deploy, not on a schedule.

## Rollback

A rollback is a redeploy and also ends active rooms. Durable data stays in Postgres. If live routes break, check `/healthz`, `/readyz` and the server logs, then rerun the local production smoke (see [`testing.md`](testing.md)) against the suspected commit.
