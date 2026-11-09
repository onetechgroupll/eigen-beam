# Contributing

Thanks for helping. eigen.beam is a small project with a clear product line, so a short conversation first saves everyone time.

## Before you start

- **Bugs:** open an issue with steps to reproduce, the device/browser and what you expected.
- **Small fixes and docs:** send a pull request directly.
- **Features:** open an issue first. Check [`ROADMAP.md`](ROADMAP.md): items under "Next" are welcome, items under "Not building" will be declined. Architectural changes need an ADR in [`docs/adr/`](docs/adr/README.md).
- **Good first issues** are labelled [`good first issue`](https://github.com/onetechgroupll/eigen-beam/labels/good%20first%20issue). Internationalisation of the German UI is the biggest open one.
- **Security issues:** never as a public issue; see [`SECURITY.md`](SECURITY.md).

## Workflow

1. Fork the repository and create a branch from `main`.
2. Make a focused change; avoid drive-by refactors.
3. Run the gates below and describe what you ran in the PR.
4. Open a pull request against `main`. CI runs the docs check and, for app changes, typecheck, verification, build and browser/replay/ops smokes.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).

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
- `docs/deployment.md` and `.env.example` for env/deploy changes;
- `docs/security.md` for auth/public-surface changes;
- `ROADMAP.md` when you ship or drop a roadmap item;
- `docs/adr/` for architectural decisions.
