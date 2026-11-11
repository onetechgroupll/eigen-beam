# Design: making eigen.beam easy to find, run and extend

Status: accepted plan (CEO review, 2026-11-09). This is the reasoning behind the [roadmap](../../ROADMAP.md); the roadmap stays the short list.

## Goal

eigen.beam is feature-complete for a single presenter and went open source on 2026-11-09. The next phase optimises for **open-source adoption**: a stranger should be able to understand it, try it, host it and contribute without speaking German or reading the source.

Today the gaps are on that path, not in the product:

- The UI is German only.
- Self-hosting means cloning and building; the Docker image cannot migrate a fresh database on its own, and `/readyz` only checks that the database answers.
- Writing a deck with an AI client works, but only through a bearer token and a wrapper script, and a room started through MCP cannot be presented from a phone.
- Nobody has seen the project yet, so there is nothing to measure.

## How we measure it

Passive numbers only, no telemetry inside instances: GitHub stars, forks, views and clones, GHCR image pulls, Railway template deploys, and issues or pull requests from people outside the project. They are read directly at the day-30 and day-90 gates (public counters and the GHCR package page); the earlier daily capture workflow was removed to keep the repository free of token-based secrets, so traffic views and clones — which GitHub only keeps for 14 days — are not recorded historically. Baseline on 2026-11-09: all zero.

## Plan

Waves are ordered by technical dependency. Inside a wave, issues and pull requests from the community can change the order.

| Wave | Work | Done when |
|---|---|---|
| Hotfix (done) | Current AI default | Shipped in #9: one default model constant (`claude-opus-5-5`), and the editor says why the AI pass fell back to the local layout |
| W0 | Roadmap as issues + metrics capture | Every roadmap item, including deferred ones, is an issue with `good first issue` / `help wanted` labels; daily capture ran (later removed, see the changelog) |
| W0 | End button in the presenter remote | The remote ends the session after a confirmation; viewers see the end screen with the replay link |
| W0 | Lossless export and clone | `parseDeck(export(deck))` equals the deck's public slides for every slide type; owners can export their original source including notes; non-owners never receive notes. Uploaded images stay bound to the instance and the docs say so |
| W1 | Releases and a public image | A version tag builds a public GHCR image and a GitHub release with changelog; the image migrates the database on boot (with a lock); `/readyz` checks the schema version; the release smoke boots against an empty database |
| W1 | English UI | English and German chosen from the browser, including inline strings and the `lang` attribute; English demo deck and templates; README GIF |
| W1 | Real sessions | Three real sessions in front of an audience before the launch, with what broke written down |
| Launch | Tell people | 60-second demo GIF, Show HN / Reddit post, listings in MCP server directories. The demo puts live sync on the phone first and shows MCP through today's bearer-token setup |
| W2 | One-click Railway deploy | A README button creates the app from the GHCR image plus Postgres and a bucket; a mail provider key and a verified `EB_MAIL_FROM` are required fields so the first magic-link login actually arrives |
| W2 | Question moderation | The presenter can hide, star and export audience questions; replays stay free of question text |
| W3 | MCP for every major AI client | See below |

### MCP for every AI client (W3, gated)

This wave only starts after a go/no-go decision 30 days after the launch, against thresholds written into the roadmap before the launch. On go, it starts as a pilot with the Claude clients; Codex and ChatGPT follow once there is demand for them.

Goal: from Claude Code, Claude Desktop, claude.ai, Codex and ChatGPT, a prompt creates a deck **and** a room the presenter can control from their phone.

Before building:

1. Check the current MCP authorization spec and what each of the five clients supports (Dynamic Client Registration vs. client metadata documents, plan requirements).
2. Design login so an OAuth flow survives the magic link: a code typed in the same browser instead of a link that only returns to `/account`.
3. Choose the token model: stored, revocable tokens, typed as operator tokens (from env, global) or user tokens (bound to one account).
4. Add a presenter hand-off: MCP returns an authorised presenter link for the room it created.
5. Decide who operates the reference instance and under which terms. Until then it accepts no open sign-ups; after that, per-user quotas for decks, asset storage and rooms, automatic clean-up of old demo decks, and a usage and privacy notice.

Then build OAuth 2.1 with authorization code and PKCE next to the existing client-credentials flow. User tokens only see their own decks; decks created through them belong to that user directly. Security criteria: rate-limited client registration, exact `redirect_uri` matching, PKCE S256 required, single-use short-lived codes, clean-up of unused clients, existing scopes unchanged.

## Not now

Deferred, open as `help wanted` issues:

- Shared room state across instances (Redis): nobody needs more than one instance yet; it would change [ADR 0002](../adr/0002-in-memory-live-rooms.md).
- A choice of speech provider for voice-to-slides: `.txt` transcripts already work without OpenAI.
- Mailing replay artefacts to the presenter: needs signed-in presenters and a mail provider.

Not planned: telemetry pings from self-hosted instances, and zip exports that carry images between instances. The product guard rails from [ADR 0004](../adr/0004-content-first-mobile-design.md) still apply: no free-form editor, no heavy polls or quizzes, no team administration, no copy protection.
