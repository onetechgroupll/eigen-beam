# MCP endpoint

eigen.beam exposes a remote [Model Context Protocol](https://modelcontextprotocol.io) endpoint. AI clients such as Claude can create, read and update decks, upload images and start a live viewer session from a deck.

## Endpoint and auth

```text
https://<your-instance>/mcp
```

Every request needs a bearer token:

```http
Authorization: Bearer <token>
```

Tokens come from `EB_MCP_TOKEN` (single token) and `EB_MCP_TOKENS` (comma- or newline-separated list, for several clients and rotation). Both are accepted together; duplicates are ignored. With no token configured, `/mcp` fails closed with `401`.

### OAuth discovery

For OAuth-aware clients the server publishes secret-safe metadata:

```text
GET /.well-known/oauth-protected-resource/mcp
GET /.well-known/oauth-protected-resource
GET /.well-known/oauth-authorization-server
GET /.well-known/openid-configuration
```

Unauthenticated `/mcp` requests answer `401` with a `WWW-Authenticate: Bearer ... resource_metadata="..."` header.

### Optional client-credentials issuer

eigen.beam can issue its own short-lived OAuth `client_credentials` access tokens. The issuer is fail-closed and only active when both values are set:

```text
EB_OAUTH_TOKEN_SECRET=...
EB_OAUTH_CLIENTS=client-id:client-secret|deck:read+room:create
```

`EB_OAUTH_CLIENTS` takes comma- or newline-separated entries. Scopes are limited to `deck:read`, `deck:write`, `room:create` and `asset:upload`. `POST /oauth/token` accepts `application/x-www-form-urlencoded` and `application/json` bodies.

## Tools

| Tool | Does | Scope |
|---|---|---|
| `create_deck` | Create a deck from Markdown | `deck:write` |
| `get_deck` | Read a deck including its Markdown source | `deck:read` |
| `update_deck` | Replace a deck's Markdown | `deck:write` |
| `create_room` | Start a live viewer session from a deck | `deck:read` + `room:create` |
| `upload_asset` | Upload an image, get a Markdown image line back | `asset:upload` |

### Deck Markdown

- `---` separates slides; `# Headline` sets the headline.
- `![Alt](https://...)` adds an image.
- `notes: ...` adds presenter-only speaker notes; public payloads strip them.
- `type: number`, `quote`, `compare` and `timeline` select block types; `++` marks a progressive-reveal step.

The tool descriptions of `create_deck` and `update_deck` carry deck-quality guidance so clients plan well before calling them: think vertical 9:16, one idea per slide, short headlines, 5 to 12 slides (at most 15), notes separated with `notes:`.

### `create_deck`

```json
{ "title": "Q3 update", "source": "# Slide 1\n\nText\n---\n# Slide 2\n\nText" }
```

Returns `id`, `title`, `slideCount`, `editUrl`, `deckApiUrl` and `newRoomApiUrl`. MCP decks are created **unowned**, so the first signed-in browser editor can claim them instead of a service account blocking later edits.

### `get_deck`

```json
{ "id": "..." }
```

Returns the deck including `source` and `updatedAt`, plus the same links.

### `update_deck`

```json
{ "id": "...", "title": "Q3 update v2", "source": "# New version\n---\n# Second slide" }
```

Replaces the whole deck. Call `get_deck` first and write back the complete new source.

### `create_room`

```json
{ "deckId": "...", "pin": "optional" }
```

Returns `roomId`, `deckId`, `deckTitle`, `slideCount`, `viewerUrl`, `replayUrl` and `protected`. It deliberately **never returns a presenter token**; presenter control stays in an httpOnly cookie ([ADR 0003](adr/0003-presenter-auth-httponly-cookie.md)).

### `upload_asset`

```json
{ "filename": "chart.png", "imageBase64": "iVBORw0KGgo...", "alt": "Revenue chart" }
```

`imageBase64` may also be a data URI. Same formats and limits as the editor: PNG, JPEG, WebP, GIF, at most 5 MB decoded. Returns `key`, `url`, `mime`, `alt` and a ready-to-paste `markdown` line, but no image bytes.

Example payloads: [`examples/mcp-create-deck.json`](../examples/mcp-create-deck.json), [`examples/mcp-create-room.json`](../examples/mcp-create-room.json).

## Clients

- **Claude Code:** the repo ships a project-scoped setup, see [`mcp-claude-code.md`](mcp-claude-code.md).
- **Other clients:** any client that supports remote HTTP MCP servers with a bearer header, or a stdio bridge such as `mcp-remote`.

## Verifying

```bash
bun run smoke:mcp                        # initialize + tools/list, no side effects
EB_MCP_SMOKE_MUTATE=1 bun run smoke:mcp  # real tool calls: test deck, room and asset
```
