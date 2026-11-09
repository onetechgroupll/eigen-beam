# Contributing

Contributions are welcome. Changes follow a production-grade workflow.

## Setup

```bash
bun install
bun run doctor
bun run docs:check
bun run check
bun run build
```

## Development principles

- Keep the product mobile-first and content-first.
- Keep live sync on SSE; do not replace it with WebSockets without an explicit architecture decision.
- Keep presenter tokens out of URLs and public JSON.
- Treat viewer/replay/share/export routes as public surfaces.
- Do not deploy during a real live presentation.

## Before opening a PR

Run the relevant gates:

```bash
bun run docs:check
bun run doctor
bun run check
bun run verify:c1a
bun run build
```

For product/UI/live-flow changes, also run local production smokes:

```bash
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:browser
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:replay
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:ops
```

For mobile-sensitive changes, run or trigger Mobile QA Lab and inspect screenshots.

## Pull request expectations

A PR should include:

- what changed;
- why it changed;
- verification commands and results;
- screenshots/artifact links for UI changes;
- deploy/rollback notes if production behavior changed;
- security/public-surface notes when routes, auth, imports, MCP or exports changed.

## Git rules

- Do not commit secrets.
- Do not use `git add -A` blindly.
- Do not bypass hooks/checks with `--no-verify`.
- Keep changes focused; avoid drive-by refactors.

## Documentation updates

Update docs when behavior changes:

- `README.md` for user/developer-facing entry points;
- `docs/development.md` and `docs/scripts.md` for local DevEx/script changes;
- `docs/testing.md` for scripts and CI gates;
- `docs/deployment.md` for env/deploy changes;
- `docs/security.md` for auth/public-surface changes;
- `docs/eigenbeam-roadmap-2026-06-28.md` for status matrix changes.
