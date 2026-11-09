# Architecture

`eigen.beam` is a SvelteKit `adapter-node` live presentation app. The core design goal is to keep the audience synced to the presenter on their own phones with minimal join friction.

## System diagram

```text
                 ┌──────────────────────────────┐
                 │        SvelteKit server       │
                 │        adapter-node           │
                 └──────────────┬───────────────┘
                                │
Presenter remote                │                         Viewer phones
/present/:id                    │                         /v/:id
┌──────────────┐   POST slide   │    SSE sync/reveal      ┌──────────────┐
│ Next / Prev  │ ─────────────▶ │ ──────────────────────▶ │ Live viewer  │
└──────────────┘                │                         └──────────────┘
        ▲                       │
        │ SSE audience events   │
        └───────────────────────┘

Durable stores:
- Postgres: decks, replay sessions, events, follows
- S3-compatible bucket: images/assets
- Resend/Postmark: transactional mail
- MCP: authenticated AI-client tool surface
```

## Live rooms

Live room state is intentionally in-memory:

```text
Map<roomId, roomState>
```

A room snapshot contains the deck slides, current slide/reveal state, subscribers, presenter auth state and TTL/caps. This keeps live sync fast and avoids DB hits per viewer event.

Trade-off: deploy/restart ends active rooms. Durable decks/replays/follows survive because they live in Postgres.

## Realtime model

The realtime flow is asymmetric:

- presenter and viewer mutations use `POST`;
- server-to-viewer sync uses SSE;
- server-to-presenter audience signals use SSE.

SSE is preferred over WebSockets because native `EventSource` reconnect behavior matches the app's unidirectional streaming needs.

## Durable data

| Data | Store |
|---|---|
| Decks | Postgres or local file store |
| Replay sessions/events | Postgres or disabled/local modes |
| Follow records | Postgres/file |
| Assets | Local files or an S3-compatible bucket |
| Live room current state | In-memory only |

## Public serializers

Public routes must use public-safe projections. They must not expose:

- raw deck source;
- `speakerNotes`;
- owner IDs;
- presenter tokens;
- MCP bearer tokens;
- signed Magic-Link URLs.

## Auth surfaces

- Presenter control: httpOnly presenter cookie.
- User/account: signed Magic-Link session cookie.
- PIN rooms: signed room-scoped unlock cookie.
- MCP: bearer token and optional scoped OAuth client-credentials token.
- Stats/admin-ish API: auth header, not query-string secrets.

## Production dependencies

- One long-lived Node process (Docker image or any Node 22 host); see [ADR 0005](adr/0005-single-sveltekit-node-service.md).
- Postgres for durable app data.
- An S3-compatible bucket for assets (AWS S3, Cloudflare R2, MinIO, Railway Buckets, ...).
- Resend or Postmark for mail.
- GitHub Actions for CI, Mobile QA and the optional deployment watchdog.

The reference instance runs on Railway. Setup for your own host: [`deployment.md`](deployment.md). Decisions behind this design: [`adr/`](adr/README.md).
