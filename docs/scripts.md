# Script Reference

All commands are run from the repository root.

| Script | Purpose | Notes |
|---|---|---|
| `bun run dev` | Start Vite dev server. | Fast local UI loop. |
| `bun run doctor` | Check local tool/env readiness. | No secrets printed; warnings are non-fatal. |
| `bun run docs:check` | Validate Markdown links/fences plus JSON/YAML shape. | Fast docs-only gate; also used by CI docs-only path. |
| `bun run check` | `svelte-kit sync` + `svelte-check`. | Canonical type/a11y gate. |
| `bun run verify:c1a` | Repository assertion suite. | Expected: `ALL PASS — 68 assertions.` |
| `bun run build` | Production SvelteKit adapter-node build. | Clean stale build artifacts if chunk resolution fails. |
| `bun run start` | Run `node build`. | Requires prior `bun run build`. |
| `bun run preview` | Alias for `node build`. | Same as `start`. |
| `bun run smoke:browser` | Browser smoke against `EB_SMOKE_BASE`. | Needs production server running. |
| `bun run smoke:replay` | Replay/follow-up smoke against `EB_SMOKE_BASE`. | Needs production server running. |
| `bun run smoke:ops` | Health/readiness/OAuth metadata smoke. | Defaults to `http://127.0.0.1:4176` if `EB_SMOKE_BASE` is not set. |
| `bun run smoke:mcp` | Repo-local MCP wrapper smoke. | Mutating tool calls require `EB_MCP_SMOKE_MUTATE=1`. |
| `bun run qa:mobile` | Mobile QA Lab. | Captures screenshots and `results.json`. |
| `bun run watchdog:prod` | Ops smoke for a deployed instance. | Alias for `scripts/smoke-ops.ts`; set `EB_SMOKE_BASE`. |
| `bun run db:migrate` | Run database migrations. | Requires `DATABASE_URL`. |

## Common env vars

| Variable | Used by | Meaning |
|---|---|---|
| `EB_SMOKE_BASE` | smokes | Base URL for local/production smoke target. |
| `PORT`, `HOST`, `ORIGIN` | `node build` | Local adapter-node binding and CSRF origin. |
| `EB_DATA_DIR` | file/outbox stores | Local data root. |
| `EB_DECK_STORE` | app/build/smokes | `file`, `memory` or `postgres`. |
| `EB_ACTIVITY_STORE` | replay/follows | `off`, local/file modes or `postgres`. |
| `EB_MAIL_PROVIDER` | auth/follow | `outbox`, `console`, `resend`, `postmark`. |
| `EB_MAGIC_LINK_SECRET` | auth | Required for production-like auth. |
| `DATABASE_URL` | migrations/postgres | Required for Postgres modes. |
| `EB_MCP_TOKEN`, `EB_MCP_TOKENS` | MCP | Bearer token(s) for `/mcp`. |
| `EB_MCP_TOKEN_FILE` | MCP wrapper | Local ignored token file path. |

## Local CI parity

```bash
bun install --frozen-lockfile
bun run docs:check
bun run doctor
bun run check
bun run verify:c1a
bun run build
```

Then start `node build` and run the three smokes from [`testing.md`](testing.md).
