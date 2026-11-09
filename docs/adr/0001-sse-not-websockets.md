# ADR 0001: Server-Sent Events, not WebSockets, for live sync

Status: Accepted

## Context

The core of eigen.beam is that every audience phone shows the slide the presenter is on, right now. Traffic is asymmetric: one presenter changes state rarely (a tap per slide), many viewers only need to receive it. Viewers sit on mobile networks and lose connection often; tabs get suspended on iOS.

## Decision

- Server to viewer: `GET /v/:id/stream` is an SSE stream. On connect the server sends an `event: sync` with the current state, then pushes every change.
- Presenter to server: plain `POST /present/:id/slide`.
- Audience signals (reactions, questions, bookmarks) are viewer `POST`s; the server streams them to the presenter over a second SSE stream, `GET /present/:id/events`.
- When a room ends while streams are open, the server sends `event: ended` and closes, so clients do not reconnect in a loop.
- A failed SSE write reaps the dead connection (unsubscribe, clear heartbeat, close). Broadcasts iterate over a snapshot of subscribers.

## Consequences

- `EventSource` reconnects natively; a late joiner or a reconnecting phone just receives a fresh `sync`. No replay log is needed.
- SSE runs inside SvelteKit `adapter-node` without a custom server or a WebSocket plugin.
- Proxies that buffer responses break SSE. The app sends heartbeats; deployments must not buffer `text/event-stream`.
- If a future feature needs high-frequency bidirectional traffic, this decision has to be revisited instead of bolting WebSockets on next to it.
