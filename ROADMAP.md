# Roadmap

eigen.beam is a working product: the core live flow, authoring, audience signals, replay and MCP are shipped and run on the reference instance. This page lists what exists, what would be good next, and what the project deliberately does not build. Ideas and pull requests for the "Next" list are welcome; open an issue first for anything larger.

## Shipped

| Area | What is there |
|---|---|
| Live core | Presenter remote, viewer lock with back-browsing, SSE sync, late join and reconnect, room TTL and caps, explicit room end |
| Authoring | Markdown with `---` slides, templates (narrative arc, pitch, update), block types (number, quote, image, compare, timeline), progressive reveal (`++`), speaker notes (`notes:`) |
| Import | PDF and PPTX import with preview, progress and error states; voice-to-slides |
| Quality | Ready Check / Deck Quality Coach with deterministic heuristics and quick fixes; optional AI clarity pass |
| Audience | Reactions, questions, bookmarks, presence, re-open rate, sentiment curve, presenter feed and live stats |
| After the talk | Replay, recap page, clone, public-safe Markdown/JSON export, session summary, slide heatmap, follow-up pack, deck v2 draft, session coach |
| Accounts | Magic-link sign-in, deck library, private / link / team visibility, PIN-protected rooms |
| AI clients | Remote MCP endpoint (`create_deck`, `get_deck`, `update_deck`, `create_room`, `upload_asset`), bearer tokens, OAuth discovery and optional client-credentials issuer |
| Ops | `/healthz`, `/readyz`, CI with browser/replay/ops smokes, Mobile QA Lab workflow, deployment watchdog, Dockerfile |

## Next

Good places to contribute, roughly in order of impact:

- **Internationalisation.** The UI is German. Extract strings, add English, pick the language from the browser.
- **Up-to-date AI defaults.** Refresh the default Claude model and make provider settings easier to discover.
- **Question moderation and export.** Let the presenter hide, star and export audience questions.
- **Speech provider choice** for voice-to-slides, beyond the current transcription path.
- **Smoother MCP onboarding.** Easier OAuth client provisioning and token rotation.
- **Sending replay artifacts** (summary, follow-up pack) to the presenter by mail.
- **Optional shared room state** (for example Redis pub/sub) for operators who need more than one instance. This would amend [ADR 0002](docs/adr/0002-in-memory-live-rooms.md).

## Not building

These are product guard rails, see [ADR 0004](docs/adr/0004-content-first-mobile-design.md):

- A free-form WYSIWYG editor. It invites overloaded slides.
- Heavy polls and quizzes. Audience features stay lightweight and never compete with the slide.
- Team administration, roles or enterprise branding.
- Hard copy protection. The viewer lock is a social default, not DRM.
