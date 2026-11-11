# Roadmap

eigen.beam is a working product: the core live flow, authoring, audience signals, replay and MCP are shipped and run on the reference instance. This page lists what exists, what would be good next, and what the project deliberately does not build. Ideas and pull requests for the "Next" list are welcome; open an issue first for anything larger.

## Shipped

| Area | What is there |
|---|---|
| Live core | Presenter remote, viewer lock with back-browsing, SSE sync, late join and reconnect, room TTL and caps, explicit room end |
| Authoring | Markdown with `---` slides, templates (narrative arc, pitch, update), block types (number, quote, image, compare, timeline), progressive reveal (`++`), speaker notes (`notes:`) |
| Languages | Full English and German UI, persistent language switch, generated deck content follows the deck language |
| Import | PDF and PPTX import with preview, progress and error states; voice-to-slides |
| Quality | Ready Check / Deck Quality Coach with deterministic heuristics and quick fixes; optional AI clarity pass on a current Claude model, with a visible note when it falls back to the local layout |
| Audience | Reactions, questions, bookmarks, presence, re-open rate, sentiment curve, presenter feed and live stats |
| After the talk | Replay, recap page, clone, public-safe Markdown/JSON export, session summary, slide heatmap, follow-up pack, deck v2 draft, session coach |
| Accounts | Magic-link sign-in, deck library, private / link / team visibility, PIN-protected rooms |
| AI clients | Remote MCP endpoint (`create_deck`, `get_deck`, `update_deck`, `create_room`, `upload_asset`), bearer tokens, OAuth discovery and optional client-credentials issuer |
| Ops | `/healthz`, `/readyz`, CI with browser/replay/ops smokes, Mobile QA Lab workflow, deployment watchdog, Dockerfile |

## Next

The plan behind this list, with waves and reasoning, is in [`docs/designs/oss-adoption.md`](docs/designs/oss-adoption.md). Good places to contribute, roughly in order of impact:

- **Question moderation and export ([#10](https://github.com/onetechgroupll/eigen-beam/issues/10)).** Let the presenter hide, star and export audience questions.
- **Speech provider choice ([#11](https://github.com/onetechgroupll/eigen-beam/issues/11))** for voice-to-slides, beyond the current transcription path.
- **Smoother MCP onboarding ([#12](https://github.com/onetechgroupll/eigen-beam/issues/12)).** Easier OAuth client provisioning and token rotation.
- **Sending replay artifacts ([#13](https://github.com/onetechgroupll/eigen-beam/issues/13))** (summary, follow-up pack) to the presenter by mail.
- **Optional shared room state ([#14](https://github.com/onetechgroupll/eigen-beam/issues/14))** (for example Redis pub/sub) for operators who need more than one instance. This would amend [ADR 0002](docs/adr/0002-in-memory-live-rooms.md).

## Adoption gate (day 30)

The "MCP for every AI client" wave only starts after a go/no-go decision 30 days after launch, measured against the fixed thresholds below. See [the adoption design](docs/designs/oss-adoption.md) for the reasoning.

1. **Community engagement:** At least 5 issues or pull requests opened by people outside the maintainer team within the first 30 days after launch, excluding spam, duplicates and `wontfix` items.
2. **Self-hosting signal:** At least 10 combined GHCR image pulls and template deploys.
3. **Field sessions:** At least 3 documented sessions in front of a real audience, recorded in session notes or issues labelled `field`.

Go requires all three criteria. On no-go, "MCP for every client" is dropped from the plan and the bearer-token MCP endpoint stays as is. The day-90 metrics check can reopen it as a fresh decision.

## Not building

These are product guard rails, see [ADR 0004](docs/adr/0004-content-first-mobile-design.md):

- A free-form WYSIWYG editor. It invites overloaded slides.
- Heavy polls and quizzes. Audience features stay lightweight and never compete with the slide.
- Team administration, roles or enterprise branding.
- Hard copy protection. The viewer lock is a social default, not DRM.
