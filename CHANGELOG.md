# Changelog

This project does not currently publish formal versioned releases. This changelog tracks major repo/product milestones at a human-readable level.

## Unreleased / current main

- Markdown export and cloning now roundtrip all six slide types without losing number or quote content, escape reserved body syntax, and keep original source with speaker notes available only to the owner export.
- An explicit `type: text` now keeps an attached image inline instead of switching the slide to the full-bleed image layout.
- Presenter remotes can explicitly end a session from the Session menu or final slide, with question export, retry-safe acknowledgement and a persisted end summary. Viewers receive a replay-first end screen, including after reconnect or activity-store fallback; ended rooms now have a configurable retention TTL and deterministic eviction.
- Open-sourced under the MIT License.
- New README with animated graphics (`tools/readme/build.py`), self-hosting guide, `Dockerfile` and English documentation throughout.
- Architecture decision records (`docs/adr/`), public `ROADMAP.md` and `docs/design-system.md` replace the internal design and roadmap briefs.
- Smoke, QA and MCP scripts default to a local instance instead of the reference deployment; the MCP wrapper reads its endpoint from `EB_MCP_URL` or `.data/secrets/eigenbeam-mcp-url.txt`.
- The deployment watchdog targets the repository variable `EB_WATCHDOG_URL` and is skipped without it.
- The AI clarity pass and import re-layout default to `claude-opus-5-5` (the old `claude-3-5-sonnet-latest` was retired, so AI calls fell back to the local layout without saying so). Both calls share one SDK-based module; the editor now says when and why it used the local layout.
- Timeline entries accept labels with colons and hyphens (`- 09:30: Kick-off`); the built-in template's timeline slide parsed wrong before.
- Decks created via MCP are no longer open to everyone. Until claimed they have no editor over HTTP and return no `source` or speaker notes; the MCP `editUrl` carries a signed claim token, and confirming **Deck übernehmen** on that page makes the browser the owner (a `POST`, so link previews cannot claim it).
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
