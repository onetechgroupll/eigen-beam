# eigen.beam Documentation Index

This directory contains product, architecture, operations and integration documentation for eigen.beam.

## Fast paths

### I want to understand the product

1. [`../README.md`](../README.md) — GitHub landing page and quickstart.
2. [`eigenbeam-design-2026-06-28.md`](eigenbeam-design-2026-06-28.md) — product rationale, constraints and architecture decisions.
3. [`eigenbeam-roadmap-2026-06-28.md`](eigenbeam-roadmap-2026-06-28.md) — implementation status and roadmap history.

### I want to run or verify the app

1. [`development.md`](development.md) — first 10 minutes, daily loop, reset/recovery and CI-credit discipline.
2. [`scripts.md`](scripts.md) — script reference and common env vars.
3. [`testing.md`](testing.md) — check/build/smoke/mobile QA commands.
4. [`qa.md`](qa.md) — curated screenshots, QA evidence and manual review checklist.
5. [`troubleshooting.md`](troubleshooting.md) — common local, CI, Railway, MCP and WebKit issues.
6. [`eigenbeam-ops.md`](eigenbeam-ops.md) — health/readiness endpoints and production watchdog.
7. [`deployment.md`](deployment.md) — Railway production setup.

### I want to connect an AI/MCP client

1. [`eigenbeam-mcp.md`](eigenbeam-mcp.md) — hosted MCP endpoint, auth and tools.
2. [`eigenbeam-mcp-claude-setup.md`](eigenbeam-mcp-claude-setup.md) — Claude Code project-scoped setup.
3. [`editor-and-agent-setup.md`](editor-and-agent-setup.md) — editor, Claude/Hermes and local token setup.

### I want to review security/public surfaces

1. [`security.md`](security.md) — app-specific security model and invariants.
2. [`privacy.md`](privacy.md) — data-use and privacy notes.
3. [`../SECURITY.md`](../SECURITY.md) — repository-level security policy.
4. [`eigenbeam-ops.md`](eigenbeam-ops.md) — secret-safe readiness payloads.

### I want a tutorial or example

1. [`tutorials/manual-live-session.md`](tutorials/manual-live-session.md) — run the core presenter/viewer flow.
2. [`tutorials/import-to-live-room.md`](tutorials/import-to-live-room.md) — import content and launch a room.
3. [`tutorials/mcp-create-and-launch.md`](tutorials/mcp-create-and-launch.md) — use MCP to create and launch a deck.
4. [`tutorials/replay-to-follow-up.md`](tutorials/replay-to-follow-up.md) — use replay artifacts for follow-up.
5. [`../examples/`](../examples/) — example decks and MCP payloads.

## Current docs

| File | Purpose |
|---|---|
| [`development.md`](development.md) | First-10-minutes setup, daily dev loop and CI-credit discipline. |
| [`scripts.md`](scripts.md) | Script reference and env var map. |
| [`editor-and-agent-setup.md`](editor-and-agent-setup.md) | Claude/Hermes/MCP/editor setup. |
| [`fixtures.md`](fixtures.md) | Example decks, MCP payloads and fixture rules. |
| [`architecture.md`](architecture.md) | System diagram, live-room model, durable stores and auth boundaries. |
| [`testing.md`](testing.md) | Local, CI, smoke and mobile QA verification. |
| [`deployment.md`](deployment.md) | Railway deployment, production env and migration checklist. |
| [`security.md`](security.md) | Public surfaces, auth model, MCP security and disclosure process. |
| [`privacy.md`](privacy.md) | Data-use, PII and provider/MCP privacy notes. |
| [`troubleshooting.md`](troubleshooting.md) | Common local/CI/production/MCP issues and fixes. |
| [`qa.md`](qa.md) | Curated mobile screenshots and manual QA checklist. |
| [`eigenbeam-ops.md`](eigenbeam-ops.md) | `/healthz`, `/readyz` and production watchdog. |
| [`eigenbeam-mcp.md`](eigenbeam-mcp.md) | MCP endpoint, tools, scopes and examples. |
| [`eigenbeam-mcp-claude-setup.md`](eigenbeam-mcp-claude-setup.md) | Claude Code Mac App setup. |
| [`eigenbeam-design-2026-06-28.md`](eigenbeam-design-2026-06-28.md) | Original product/design/architecture brief. |
| [`eigenbeam-roadmap-2026-06-28.md`](eigenbeam-roadmap-2026-06-28.md) | Roadmap and implementation status matrix. |

## Documentation conventions

- Keep the README as the public/front-door summary.
- Keep deep implementation rationale in `docs/`.
- Keep secrets out of examples; use variable names and redacted placeholders only.
- Update [`testing.md`](testing.md) whenever scripts or GitHub Actions gates change.
- Update [`development.md`](development.md) or [`scripts.md`](scripts.md) whenever local setup/scripts change.
- Update [`deployment.md`](deployment.md) whenever Railway env, migrations or durable backend requirements change.
