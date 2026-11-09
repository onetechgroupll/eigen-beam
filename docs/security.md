# Security Model

This document captures eigen.beam's security-relevant surfaces and invariants.

## Public surfaces

| Surface | Purpose | Main controls |
|---|---|---|
| `/` | public landing / room creation CTA | no secrets |
| `/v/:id` and `/v/:id/stream` | viewer experience and SSE sync | unguessable room ids, optional PIN, room caps/TTL |
| `/present/:id` | presenter remote | httpOnly presenter cookie scoped to presenter route |
| `/present/:id/events` | presenter-side SSE for live signals | presenter auth, SSE cleanup |
| `/replay/:id`, `/recap/:id`, `/share/:id` | public/session-after surfaces | public serializers, visibility/PIN checks |
| `/api/decks/*` | deck CRUD/export/share/clone/assets | owner/session/visibility checks |
| `/api/import/*` | PDF/PPTX/voice import | production user session required |
| `/api/replay/*` | replay summaries/follow-up/heatmap/coach | public-safe payloads |
| `/mcp` | AI client tools | bearer/OAuth auth, scoped tool execution |
| `/healthz`, `/readyz` | ops checks | secret-safe payloads |

## Core invariants

1. **Presenter tokens never appear in URLs or public JSON.** Presenter access is via httpOnly cookies.
2. **Room ids are unguessable.** Use `nanoid`; no sequential ids.
3. **Slide index changes are clamped.** Never allow `setSlide` outside `[0, slides.length - 1]`.
4. **SSE write failures reap dead connections.** Do not swallow write errors without cleanup.
5. **Public payloads are serialized.** Public viewer/replay/share/export data must not leak `ownerId`, raw `source`, `speakerNotes`, private markers or bearer tokens.
6. **Production auth fails closed.** Missing production secrets should block sensitive flows rather than falling back to dev behavior.
7. **Import/AI endpoints require production user sessions.** They can process user content and may call providers when configured.
8. **MCP tools require auth.** Missing token config means `/mcp` returns `401`; tool results never include presenter tokens.
9. **Readiness is secret-safe.** `/readyz` may reveal mode/status labels, never credential values or URLs with secrets.
10. **Do not deploy during live presentations.** Live room state is in-memory.

## MCP security

`/mcp` supports legacy bearer tokens and rotated token lists. Optional OAuth client-credentials tokens are scoped to:

- `deck:read`
- `deck:write`
- `room:create`
- `asset:upload`

`create_room` returns viewer/replay links only. It intentionally does not return presenter URLs or tokens.

Decks created via `create_deck` have no owner. Over HTTP nobody has edit access to them (no `source`, no speaker notes, no update, upload, delete or room start) until someone claims it through the `editUrl`. That URL carries an HMAC claim token over the deck id, signed with `EB_MAGIC_LINK_SECRET`. A `GET` only renders a confirmation page (with `referrer: no-referrer`); the claim is the `POST` form action `?/claim`, which re-checks the token and makes the browser's actor the owner in one atomic `owner_id IS NULL` update, then redirects to the URL without the token. Claiming on `POST` keeps link-preview bots, which only issue `GET`s, from taking the deck. The claim token has no expiry; it only matters while the deck is unowned. The token only matters while the deck is unowned. MCP returns claim links only to tokens with `deck:write`; `deck:read`-only tokens get the plain editor URL. The file backend serializes mutations per deck in-process, so concurrent claims have exactly one winner; multiple processes on one data directory are not covered (use Postgres). MCP tools themselves are not owner-scoped: any token with `deck:read` can read any deck by id, including its source and notes.

## Data and PII policy

- Viewer event/stats payloads are designed to avoid PII.
- Free-text questions stay presenter-side and are not exposed in public replay by default.
- Follow/magic-link email handling uses signed tokens and production mail provider config.
- Logs and docs must not include raw API keys, bearer tokens, database URLs or magic links.

## Reporting process

Report suspected issues privately via GitHub's [private vulnerability reporting](https://github.com/onetechgroupll/eigen-beam/security/advisories/new), not as public issues.

Include:

- affected route or tool;
- reproduction steps;
- expected vs actual access;
- whether secrets/tokens/PII were exposed;
- screenshots or logs with secrets redacted.

See also [`../SECURITY.md`](../SECURITY.md).
