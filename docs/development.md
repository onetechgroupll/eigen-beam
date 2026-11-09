# Development Guide

This is the first-stop guide for working on eigen.beam locally.

## First 10 minutes

```bash
bun install
bun run doctor
bun run dev
```

Open the Vite URL, click **Live-Sync testen**, open the viewer link in a second browser/phone and tap **Weiter** on the presenter remote.

Then run the fast local gate:

```bash
bun run check
bun run verify:c1a
bun run build
```

## Daily development loop

| Task | Command |
|---|---|
| Start dev server | `bun run dev` |
| Check Svelte/TypeScript | `bun run check` |
| Run repository assertions | `bun run verify:c1a` |
| Validate docs only | `bun run docs:check` |
| Check local tool/env readiness | `bun run doctor` |
| Build adapter-node output | `bun run build` |

## Local environment modes

Default local mode is intentionally low-friction:

- deck store: file-backed under `.data/`;
- activity/replay store: local/off unless configured;
- mail: outbox JSON files;
- assets: local file store;
- AI/import: deterministic fallback unless provider env is configured.

Start production-like local smoke mode:

```bash
rm -rf build .svelte-kit/output .svelte-kit/generated
bun run build
ORIGIN=http://127.0.0.1:4316 \
EB_MAGIC_LINK_SECRET=local-smoke-secret \
EB_DATA_DIR=.data/ci-smoke \
EB_DECK_STORE=file \
EB_ACTIVITY_STORE=off \
EB_MAIL_PROVIDER=outbox \
PORT=4316 HOST=127.0.0.1 \
node build
```

In another shell:

```bash
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:browser
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:replay
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:ops
```

## Reset and recovery

Safe local reset for stale build artifacts:

```bash
rm -rf build .svelte-kit/output .svelte-kit/generated
```

Safe local data reset for throwaway dev state:

```bash
rm -rf .data/dev .data/ci-smoke .data/manual-session
```

Do not point local scripts at production data or bucket storage.

## CI-credit discipline

Keep CI runs purposeful: run gates locally first.

- Run `bun run docs:check`, `bun run doctor`, `bun run check`, `bun run verify:c1a` and `bun run build` locally before pushing.
- Batch related documentation changes into one commit/push instead of many tiny pushes.
- Trigger manual **Mobile QA Lab** only for UI/mobile-sensitive changes.
- The Production Watchdog is intentionally scheduled less aggressively than every 15 minutes; use manual dispatch when actively validating a production change.
- For docs-only changes, CI has a lightweight docs-only path and skips browser smokes.

## Git workflow

- Keep changes focused.
- Do not use `git add -A` blindly.
- Do not commit `.env`, `.data`, local reports from ad-hoc runs or credential files.
- Include real verification output in PRs or handoff summaries.

## When to update docs

Update docs in the same change when behavior, scripts, env vars, public routes, auth, MCP tools, deployment assumptions or QA expectations change.
