# ADR 0002: Live rooms live in process memory

Status: Accepted

## Context

A live room holds the deck snapshot, current slide and reveal step, the subscriber list and the presenter's auth state. It changes with every tap and is read on every viewer connect. Sessions last minutes to an hour; afterwards only the replay matters.

## Decision

Rooms are a `Map<roomId, roomState>` inside the single server process. Room IDs are unguessable `nanoid`s. Every room has a TTL, a subscriber cap and an explicit end. When a room is gone, `/v/:id` answers `410` with a friendly "presentation ended" screen.

Durable data is separate: decks, replay sessions and events, and follows go to Postgres (or local files in minimal mode).

## Consequences

- Late join and reconnect are trivial, and no database is touched per viewer event.
- **A restart or deploy ends every active room.** Operators must not deploy during a live presentation. Decks and replays survive.
- Presenter question-moderation state (open, starred, done and hidden) belongs to the room and is lost with it on restart; it is not part of the durable replay.
- One process means one instance. Horizontal scaling would need shared room state (for example Redis pub/sub) and is not supported today.
