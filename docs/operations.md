# Operations

Health endpoints, readiness and monitoring for a running instance.

## Endpoints

```text
GET /healthz
GET /readyz
```

### `/healthz`

Cheap liveness: no database or provider calls. Use it for load balancer and container health checks.

```json
{ "ok": true, "status": "ok", "service": "eigenbeam", "timestamp": "..." }
```

### `/readyz`

Sanitised readiness. In production mode it checks the fail-closed configuration and compares the latest applied `schema_migrations` filename with the version expected by the running code. Every check has `status`, `expected`, `actual` and `fix`; fix text contains only environment-variable names and the deployment-documentation link, never values.

Production mode expects, among others:

- `ORIGIN=https://...`
- `EB_MAGIC_LINK_SECRET` set
- `EB_DECK_STORE=postgres` and `EB_ACTIVITY_STORE=postgres`
- `DATABASE_URL` set and reachable
- `EB_ASSET_STORE=s3` with `EB_BUCKET_NAME`
- `EB_MAIL_PROVIDER=resend|postmark` with its credential
- `EB_MCP_TOKEN`, `EB_MCP_TOKENS`, or OAuth-only configuration through `EB_OAUTH_CLIENTS` plus `EB_OAUTH_TOKEN_SECRET`

| Response | Meaning |
|---|---|
| `200`, `ok: true` | ready for traffic |
| `503`, `ok: false` | not ready; the body names the failing check without secrets |

Use `/healthz` for process liveness. Use `/readyz` for Railway, Compose or any load-balancer probe that decides whether the instance may receive traffic.

## Migration failures

The image and `bun run db:migrate` use the same runner. It takes a fixed Postgres session advisory lock on one dedicated client, applies one transaction per file and records the filename only in that transaction. Lock acquisition has three bounded attempts; statement execution also has a session timeout.

Failure logs have one stable line:

```text
EB_MIGRATE_FAILED migration=<filename-or-lock> cause=<postgres-code>
```

1. Keep the failed instance out of traffic and inspect that line. `cause=55P03` means another migrator held the lock for the full retry window.
2. Confirm whether the other deploy is still migrating. Retry the same image after it finishes; already-recorded files are skipped.
3. For a SQL error, restore or correct the database according to [`upgrading.md`](upgrading.md), then rerun the same image's `migrate` command. Do not edit `schema_migrations` by hand.

The rollback window stays open only while all migrations since the previous version are additive and the old binary can read the new schema. Once a non-additive migration runs or new-version writes cross that compatibility boundary, restore the pre-upgrade backup instead of redeploying the old image.

## Ops smoke

```bash
EB_SMOKE_BASE=https://beam.example.com bun run smoke:ops
```

It checks `/healthz`, `/readyz` and the MCP OAuth metadata. Without `EB_SMOKE_BASE` it targets a local production build on `http://127.0.0.1:4176`. To assert an expected not-ready state:

```bash
EB_OPS_EXPECT_READY=false EB_SMOKE_BASE=http://127.0.0.1:4176 bun run smoke:ops
```

## Watchdog

`.github/workflows/production-watchdog.yml` checks `/healthz`, `/readyz` and `/.well-known/oauth-protected-resource/mcp` every two hours and on manual dispatch. It needs no secrets.

To enable it on your fork, set the repository variable `EB_WATCHDOG_URL` (Settings → Secrets and variables → Actions → Variables) to your instance's base URL. Without the variable the job is skipped. Failures surface through the normal GitHub Actions notifications.

Do not use `smoke:replay` or `smoke:browser` as a high-frequency watchdog: they create rooms, decks and follows on purpose.

## Live sessions and deploys

Restarts end active rooms ([ADR 0002](adr/0002-in-memory-live-rooms.md)). If you run a shared instance, announce deploy windows or deploy between sessions. `/present/:id/stats` and the presenter feed show whether a room is active.
