# ADR 0003: Presenter control via httpOnly cookie, never in URLs

Status: Accepted

## Context

Whoever holds the presenter token controls what a room full of people sees. Viewer links are shared freely: read aloud, posted to group chats, shown as QR codes. Early prototypes passed the token as a query parameter, which leaks through browser history, screenshots and referrers.

## Decision

- The presenter token is set as an httpOnly cookie scoped to `/present/:id`. It never appears in a URL, a viewer payload, an export or an MCP response.
- MCP `create_room` returns viewer and replay links only.
- Public routes (viewer, replay, share, export) use dedicated serializers that strip presenter-only fields: speaker notes, raw source, owner IDs, tokens.
- PIN rooms use a signed, room-scoped unlock cookie with rate limiting. Accounts use signed magic-link session cookies.

## Consequences

- Handing over presenter control to another device means opening the presenter link on that device, not forwarding a URL with a secret in it.
- Every new public endpoint must go through a public serializer. Code review checks this.
