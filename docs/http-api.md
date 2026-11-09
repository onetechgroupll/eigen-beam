# HTTP API

The browser app talks to these endpoints. You can call them from scripts too. For AI clients, prefer the authenticated [MCP endpoint](mcp.md). This page covers everything else.

## Conventions

- **Base URL:** your instance's `ORIGIN`. Examples use `https://beam.example.com`.
- **Body:** JSON unless stated as `multipart/form-data`.
- **Errors:** `{ "error": true, "message": "…" }`. A few routes return `{ "error": "not_found" }` or `{ "error": "forbidden" }` instead. Messages are German (the UI language).
- **Rate limits:** per client IP, per process, in fixed windows. Exceeding one returns `429` with a `retry-after` header. Limits are listed per endpoint.
- **CSRF:** SvelteKit rejects cross-origin form and upload POSTs. Send requests from the same origin, or from a non-browser client.

### Identity

There are no API keys outside MCP. Ownership works through cookies:

| Cookie | Set by | Meaning |
|---|---|---|
| `eb_cid` | first deck write | anonymous creator ID, 1 year |
| `eb_uid` | `/auth/verify` (magic link) | signed user session, 1 year; wins over `eb_cid` |
| `eb_pt_<roomId>` | `/present/:id/claim` | presenter token, path `/present/<roomId>`, 12 h |
| `eb_pin_<roomId>` | `/api/rooms/:id/pin` | PIN unlock for a protected room and its replay, 12 h |

The **actor** is the signed-in user, or else the anonymous creator. A script keeps its identity by storing and resending these cookies (for example `curl -c jar -b jar`).

### Deck access

| | Owner | Anyone else |
|---|---|---|
| Edit, upload, start a room | yes | only if the deck has no owner yet (decks created via MCP); the first editor claims it |
| Delete | yes | no |
| View, export, clone | yes | `link`: yes · `team`: signed-in users of the same email domain · `private`: no |

New decks are `private`. Speaker notes and the raw `source` are returned only to the owner.

## Decks

### Create a deck

`POST /api/decks` · limit 40 / 10 min

```bash
curl -c jar -b jar -X POST https://beam.example.com/api/decks \
  -H 'content-type: application/json' \
  -d '{"title":"Q3","source":"# Revenue is up\nCost is flat.\n\n---\n\n# Next steps"}'
```

| Field | Type | Notes |
|---|---|---|
| `title` | string | optional, max 120 characters, default `Unbenannt` |
| `source` | string | [deck syntax](deck-syntax.md), max 50,000 characters, 1–60 slides |

`201` → `{ id, title, slides }`. Errors: `400` (no or too many slides), `413` (source too long). Creates the `eb_cid` cookie if missing.

### List your decks

`GET /api/decks` → `{ decks: [...] }` for the current actor; empty without cookies. Each item has `id`, `title`, `slideCount`, `createdAt`, `updatedAt`, `visibility`, `teamId`, `editable`, `editUrl`, `presentUrl`, `shareUrl` and `recapUrl`, newest first.

### Read a deck

`GET /api/decks/:id` → `{ id, title, slides, updatedAt }`, plus `source` for the owner. Non-owners get slides without `speakerNotes`. `403` without view access, `404` if unknown.

### Update a deck

`PUT /api/decks/:id` · limit 40 / 10 min per deck. Same body and limits as create. Owner only (or the first editor of an unowned deck). → `{ id, title, slides, updatedAt }`.

### Delete a deck

`DELETE /api/decks/:id` · limit 40 / 10 min per deck. Owner only; unowned decks cannot be deleted until claimed. → `204`.

### Change visibility

`PATCH /api/decks/:id/sharing` · limit 40 / 10 min per deck

```json
{ "visibility": "link" }
```

`private`, `link` or `team`. `team` needs a magic-link session and shares with everyone signed in under the same email domain. → `{ deck }`. Errors: `400` (unknown value), `401` (no identity / no session for `team`), `403` (not the owner).

### Clone a deck

`POST /api/decks/:id/clone` · limit 30 / 10 min per deck. Needs view access. Creates a copy owned by you, titled `<title> Kopie`, without speaker notes. `201` → `{ id, title }`.

### Export a deck

`GET /api/decks/:id/export/md` (or `markdown`) and `GET /api/decks/:id/export/json`. Needs view access. Returns a file download (`content-disposition: attachment`) built from public slides only (no speaker notes, no owner).

### Upload an image

`POST /api/decks/:id/assets` · `multipart/form-data` · limit 40 / 10 min per deck. Needs edit access.

```bash
curl -b jar -F file=@team.jpg https://beam.example.com/api/decks/<id>/assets
```

→ `{ url, key, mime, alt }`. Put `url` into a Markdown image line in the deck ([deck syntax: images](deck-syntax.md#images)). PNG, JPEG, WebP or GIF, detected from the file bytes, max 5 MB. Errors: `400` (no file), `413` (too large), `415` (not an image).

Assets are served from `GET /assets/:key` with a one-year immutable cache header (local store), or from `EB_BUCKET_PUBLIC_URL` (S3 store).

### Clarity pass

`POST /api/decks/clarify` · limit 20 / 10 min · in production mode requires a signed-in user (`401` otherwise)

```json
{ "title": "Q3", "source": "…" }
```

→ `{ title, source, mode }`. Rewrites the deck towards one idea per slide. `mode` is `ai` when `ANTHROPIC_API_KEY` is set and the call succeeds, else `local` (a deterministic fallback). The deck is not saved; send the result to `PUT /api/decks/:id` if you want it.

## Imports

All three return a draft and save nothing. Same rules: `multipart/form-data` with `file` and optional `title`, limit 20 / 10 min, signed-in user required in production mode.

| Endpoint | Accepts | Max size | Response |
|---|---|---|---|
| `POST /api/import/pdf` | `.pdf`, or any text file | 20 MB | `{ title, source, slides, extractedChars, mode }` |
| `POST /api/import/ppt` | `.pptx`, or any text file | 20 MB | same |
| `POST /api/import/voice` | audio, or a `.txt` transcript | 25 MB | `{ title, source, slides, transcript, mode }` |

Errors: `400` (no file), `413` (too large), `422` (no text found), `501` (voice without `OPENAI_API_KEY`), `502` (transcription failed). See [how to import content](how-to/import-content.md).

## Live rooms

### Start a room

`POST /api/rooms` · limit 30 / 10 min

```json
{ "deckId": "abc123", "pin": "1234" }
```

| Field | Notes |
|---|---|
| `deckId` | optional; without it the room runs the built-in demo deck. Needs edit access. |
| `pin` | optional, trimmed, max 24 characters |

→ `{ id, claimToken }`. Errors: `404 deck_not_found`, `400 deck_empty`, `403`.

### Claim the presenter cookie

`POST /present/:id/claim` with `{ "claimToken": "…" }` → sets `eb_pt_<id>` and returns `{ ok: true }`. Single use, valid for 2 minutes. `403` if invalid or used.

### Move to a slide

`POST /present/:id/slide` with `{ "slide": 3 }` (zero-based; clamped to the deck) → `{ current }`. Presenter cookie required. `403` wrong cookie, `410` room ended or unknown.

### End a room

`DELETE /present/:id/slide` → `{ ok: true }`. Presenter cookie required. Viewers receive `ended`.

### Presenter event stream

`GET /present/:id/events` (SSE, presenter cookie). Events, each with a JSON `data` payload:

| Event | Payload |
|---|---|
| `stats` | `{ stats: { joins, currentViewers, peakConcurrent, reopens, reactions, questions, bookmarks, startedAt } }` |
| `reaction` | `{ reaction, slide, ts }` |
| `question` | `{ text, slide, ts }` |
| `bookmark` | `{ slide, ts }` |
| `ended` | `{ slide, ts }` |

`403` wrong cookie, `404` unknown room, `410` ended.

### Viewer stream

`GET /v/:id/stream` (SSE). Events `sync`, `slide` and `ended`; `data` is the current zero-based slide index. A `: hb` comment every 10 s. `403 pin required`, `410 ended`, `503 busy` (300 viewers).

### Send a viewer signal

`POST /v/:id/event` · limit 60 / min per IP and room

```json
{ "type": "reaction", "reaction": "🔥", "slide": 2 }
```

| `type` | Extra fields |
|---|---|
| `reaction` | `reaction`: one of 👍 🔥 💡 ❤️ 👏 ❓ (anything else becomes 👍) |
| `question` | `text`: 1–280 characters after trimming |
| `bookmark` | — |
| `reopen` | — |

`slide` is optional and defaults to the live slide. → `{ ok: true }`. Errors: `400` (unknown type, empty question), `403` (PIN), `410` (ended).

### Unlock a PIN room

`POST /api/rooms/:id/pin` with `{ "pin": "1234" }` · limit 10 / 10 min per IP and room → sets `eb_pin_<id>`, `{ ok: true }`. `403` on a wrong PIN.

### Room stats for scripts

`GET /api/rooms/:id/stats` · limit 60 / min. Requires `EB_STATS_SECRET` on the server, sent as `Authorization: Bearer <secret>` or `x-eigenbeam-stats-secret`. → `{ stats }` for a room that is still in memory. `403` without a matching secret (or when the variable is unset), `404` otherwise.

## Replays

All replay endpoints work for live and, with `EB_ACTIVITY_STORE=postgres`, for finished rooms. PIN rooms need the `eb_pin_<id>` cookie (`403` otherwise). Responses are `cache-control: no-store`.

| Endpoint | JSON key | Contents |
|---|---|---|
| `GET /api/replay/:id` | `replay` | `{ id, slides, events, stats, ended, protected }`; question texts blanked |
| `GET /api/replay/:id/summary` | `summary` | session summary |
| `GET /api/replay/:id/heatmap` | `heatmap` | per-slide engagement |
| `GET /api/replay/:id/followup` | `followUpPack` | follow-up mail and group-chat text |
| `GET /api/replay/:id/deck-v2` | `draft` | a revised deck draft in deck syntax |
| `GET /api/replay/:id/coach` | `coach` | checklist for the next talk |
| `GET /api/replay/:id/takeaway` | `takeaway` | short takeaway |

Add `?format=md` to any of the six derived endpoints to download Markdown instead.

## Accounts

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/magic-link` `{ email }` | send a 15-minute login link · limit 5 / 10 min. `502` if mail fails. Returns `magicLink` only when `EB_AUTH_RETURN_LINK=true` outside production. |
| `GET /auth/verify?token=…` | sets `eb_uid`, moves anonymous decks to the account, redirects to `/account` |
| `GET /api/auth/me` | `{ userId, email, actorId }` |
| `POST /api/auth/logout` | clears `eb_uid` |

## Follow opt-in

| Endpoint | Purpose |
|---|---|
| `POST /api/follow` `{ email, deckId?, roomId? }` | opt in to future pings · limit 20 / 10 min. `deckId`/`roomId` must match `[a-zA-Z0-9_-]{1,64}`. Sends one confirmation mail on first opt-in. → `{ ok, email, isNew }` |
| `GET /api/follow/unsubscribe?token=…` | removes **all** opt-ins of that email; the token in the mail never expires. Returns an HTML page. |

## Operations and discovery

`GET /healthz`, `GET /readyz` ([operations](operations.md)), `/.well-known/oauth-protected-resource[/mcp]`, `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration`, `POST /oauth/token` and `POST /mcp` ([MCP](mcp.md)).

## Related

- [Deck syntax](deck-syntax.md)
- [Live sessions](live-sessions.md)
- [MCP](mcp.md)
- [Security](security.md)
