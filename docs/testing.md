# Testing and Verification

This document is the canonical verification guide for eigen.beam.

## Local prerequisites

```bash
bun install
```

For browser/mobile QA, install Playwright browsers as needed:

```bash
bunx playwright install --with-deps chromium webkit
```

On macOS, `--with-deps` may be unnecessary but is harmless in CI-oriented docs.

## Fast local gate

Run before committing code changes:

```bash
bun run docs:check
bun run doctor
bun run check
bun run verify:c1a
bun run build
```

Expected current repository verification:

```text
ALL PASS — 91 assertions.
```

## Local production smoke

Start a clean adapter-node production build:

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

### What the smokes cover

| Script | Coverage |
|---|---|
| `smoke:browser` | Home CTA hydration, presenter remote, viewer, replay, authoring, library remote, Ready Check and import error path. |
| `smoke:replay` | Room lifecycle, presenter sync, viewer events, replay APIs, follow/magic-link/outbox and auth edge cases. |
| `smoke:ops` | `/healthz`, `/readyz`, MCP protected-resource metadata. |
| `smoke:mcp` | Repo-local MCP wrapper, `initialize`, `tools/list`; optional mutating calls with `EB_MCP_SMOKE_MUTATE=1`. |

## Release smoke

The release smoke needs Docker and pulls/starts PostgreSQL. It builds the current image by default:

```bash
node scripts/release-smoke.mjs
```

Use `--image <name>` for an already-built image. `--baseline-tag <tag>` prepares the upgrade database with a historical GHCR image instead of the deterministic `001_foundation.sql` baseline. `--keep` preserves the disposable containers and network for inspection. Run `node scripts/release-smoke.mjs --help` for the complete option contract.

It verifies empty-database boot, a seeded upgrade, two parallel boots, bounded held-lock failure and unwritable-data boot failure. The tag release workflow runs it before publishing multi-platform images.

## Mobile QA Lab

Run a focused mobile profile locally:

```bash
EB_MOBILE_QA_ENGINES=webkit \
EB_MOBILE_QA_PROFILES=iphone-15-pro-dark \
EB_MOBILE_QA_BASE=http://127.0.0.1:4316 \
EB_MOBILE_QA_OUT=reports/mobile-qa-lab-local \
bun run qa:mobile
```

Useful variants:

```bash
EB_MOBILE_QA_ENGINES=chromium EB_MOBILE_QA_PROFILES=iphone-15-pro-light bun run qa:mobile
EB_MOBILE_QA_ENGINES=chromium,webkit EB_MOBILE_QA_PROFILES=iphone-15-pro-dark,iphone-15-pro-light bun run qa:mobile
```

The lab captures screenshots and a machine-readable `results.json`. It checks:

- mobile anchors for home, presenter, viewer, replay, authoring and account library;
- console/page errors, with a narrow ignore for WebKit's expected SSE abort on fast navigation;
- 44px tap-target floor;
- bottom safe-area clipping;
- account-library and authoring launch paths.

## GitHub Actions

### CI

`.github/workflows/ci.yml` runs on push and PR:

1. checkout;
2. detect docs-only push changes;
3. `python3 scripts/validate-docs.py` / `bun run docs:check` equivalent;
4. for app-impacting changes: setup Bun 1.3.14;
5. `bun install --frozen-lockfile`;
6. Playwright Chromium install;
7. `bun run check`;
8. `bun run verify:c1a`;
9. `bun run build`;
10. start `node build` on localhost;
11. `smoke:browser`, `smoke:replay`, `smoke:ops`.

Docs-only pushes skip Bun install/build/browser smokes to save private-repo CI minutes. Pull requests still run the full gate.

### Mobile QA Lab

`.github/workflows/mobile-qa.yml` is manual (`workflow_dispatch`) with inputs:

- `engines`: `chromium`, `webkit`, or comma-separated;
- `profiles`: e.g. `iphone-15-pro-dark`.

It uploads the mobile QA report and screenshots as an artifact.

### Production Watchdog

`.github/workflows/production-watchdog.yml` runs every two hours when the repository variable `EB_WATCHDOG_URL` is set (skipped otherwise, so forks stay quiet) and checks:

- `/healthz`;
- `/readyz`;
- `/.well-known/oauth-protected-resource/mcp`.

## Verification policy

- Do not call work done until the relevant local gates and real GitHub Actions run have passed.
- For GitHub Actions changes, push and wait for the real run with `gh run watch --exit-status`.
- For `workflow_dispatch` changes, manually trigger one representative run.
- For UI/mobile changes, inspect generated mobile screenshots before finalizing.
- Batch docs-only changes and rely on `bun run docs:check` locally before pushing to avoid unnecessary CI-minute churn.
