# Changelog

This project does not currently publish formal versioned releases. This changelog tracks major repo/product milestones at a human-readable level.

## Unreleased / current main

- Open-sourced under the MIT License.
- New README with animated graphics (`tools/readme/build.py`), self-hosting guide, `Dockerfile` and English documentation throughout.
- Architecture decision records (`docs/adr/`), public `ROADMAP.md` and `docs/design-system.md` replace the internal design and roadmap briefs.
- Smoke, QA and MCP scripts default to a local instance instead of the reference deployment; the MCP wrapper reads its endpoint from `EB_MCP_URL` or `.data/secrets/eigenbeam-mcp-url.txt`.
- The deployment watchdog targets the repository variable `EB_WATCHDOG_URL` and is skipped without it.
- Timeline entries accept labels with colons and hyphens (`- 09:30: Kick-off`); the built-in template's timeline slide parsed wrong before.
- User and API documentation: deck syntax reference, HTTP API reference, live-session explanation, a first-deck tutorial and how-tos for import, PIN rooms, sharing and export.

- Added top-level GitHub documentation: README, docs index, testing/deployment/security guides, contribution/security policies and GitHub templates.
- Added CI workflow for check, repository verification, build, local production browser/replay/ops smokes.
- Added manual Mobile QA Lab GitHub workflow with mobile screenshot/report artifacts.
- Added Import Preview, import progress/error states and Ready Check / Deck Quality Coach.
- Added mobile account library as a launch surface with saved deck remote cards.
- Polished mobile authoring and library flows for phone ergonomics.

## 2026-07 production hardening and product expansion

- Production Railway deployment with Postgres persistence, bucket-backed assets and Resend mail.
- Health/readiness endpoints and production watchdog.
- Hosted MCP endpoint with deck create/read/update, room creation and asset upload tools.
- OAuth protected-resource metadata and optional client-credentials token issuer.
- Replay, follow-up pack, slide heatmap, deck-v2 draft and session coach.
- Account/Magic-Link flow, deck sharing modes and PIN-protected rooms.

## 2026-06 foundation

- Initial SvelteKit `adapter-node` app.
- Mobile-first presenter/viewer experience.
- SSE-based live slide sync.
- In-memory room model.
- Markdown deck authoring and vertical slide renderer.
