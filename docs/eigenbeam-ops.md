# eigen.beam Ops / Monitoring

Minimaler Production-Ops-Check für Railway und externe Watchdogs.

## Endpoints

```text
GET /healthz
GET /readyz
```

### `/healthz`

Cheap Liveness: kein DB-/Provider-Zugriff, für Railway/HTTP-Ping geeignet.

Erwartung:

```json
{
  "ok": true,
  "status": "ok",
  "service": "eigenbeam",
  "timestamp": "..."
}
```

### `/readyz`

Sanitised Readiness: prüft Production-Konfig und, falls Postgres benötigt wird, `SELECT 1`.
Der Body enthält nur Status/Modi/Details, nie Secret-Werte, URLs oder Tokens.

Production-ready erwartet u. a.:

- `ORIGIN=https://...`
- `EB_MAGIC_LINK_SECRET` gesetzt
- `EB_DECK_STORE=postgres`
- `EB_ACTIVITY_STORE=postgres`
- `DATABASE_URL` gesetzt und erreichbar
- `EB_ASSET_STORE=s3` + `EB_BUCKET_NAME`
- `EB_MAIL_PROVIDER=resend|postmark` + Provider-Credential
- `EB_MCP_TOKEN` oder `EB_MCP_TOKENS`

Status:

- `200` + `ok: true` → ready
- `503` + `ok: false` → nicht deploy-/traffic-ready; Body zeigt den fehlerhaften Check ohne Secrets

## Smoke

```bash
bun run smoke:ops
```

Alias für lokale/CI-Watchdogs:

```bash
bun run watchdog:prod
```

Default läuft gegen Production (`https://eigen-beam-production.up.railway.app`). Für lokale Builds:

```bash
EB_SMOKE_BASE=http://127.0.0.1:4176 bun run smoke:ops
```

Wenn ein erwarteter nicht-ready Zustand bewusst geprüft werden soll:

```bash
EB_OPS_EXPECT_READY=false EB_SMOKE_BASE=http://127.0.0.1:4176 bun run smoke:ops
```

## Suggested external watchdog

- GitHub Actions Workflow: `.github/workflows/production-watchdog.yml` läuft alle 15 Minuten und per `workflow_dispatch`.
- Prüft `/healthz`, `/readyz` und `/.well-known/oauth-protected-resource/mcp` ohne Secrets.
- Alarm erfolgt über den normalen GitHub-Actions-Failure-Kanal.

Nicht verwenden: full `smoke:replay` als High-Frequency-Watchdog, weil er absichtlich Rooms/Decks/Follows erzeugt.
