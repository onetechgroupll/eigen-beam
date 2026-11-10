# Live sessions

This page explains what happens between the editor's **… live starten** button and the replay: who sees what, what the audience can send back, and where the limits are. The design rationale lives in the ADRs; this is the behaviour you get.

## Two roles, two URLs

| Role | URL | Access |
|---|---|---|
| Presenter remote | `/present/:roomId` | an httpOnly cookie set when the room is created ([ADR 0003](adr/0003-presenter-auth-httponly-cookie.md)) |
| Viewer | `/v/:roomId` | anyone with the link, plus the PIN if one is set |

A room is a **snapshot** of the deck at start time. Editing the deck afterwards does not change a running room. Start a new room to present the new version.

```text
editor ──POST /api/rooms──▶ room {id, claimToken}
       ──POST /present/:id/claim──▶ presenter cookie (eb_pt_<id>, path /present/<id>)
       ──▶ /present/:id   remote: Weiter / Zurück, notes, signals
viewers ──▶ /v/:id        SSE stream: sync → slide → … → ended
```

The claim step exists because Safari will not accept a cookie for a future `/present/:id` path from an `/api/rooms` response. The claim token is single-use and expires after two minutes.

## Joining

The remote shows a QR code and the audience link under **Join**. Viewers open the link in their phone browser. There is no app and no login. If the room has a PIN, they enter it first ([how to protect a room](how-to/protect-a-room-with-a-pin.md)).

## Following

Each viewer holds one Server-Sent Events stream ([ADR 0001](adr/0001-sse-not-websockets.md)). It sends `sync` with the current slide on connect, `slide` on every change and `ended` when the room closes. A heartbeat every 10 seconds also detects dead mobile connections and frees them.

Viewers can go **back** to reread earlier slides by tapping the left half of the screen. That stays private on their phone; the presenter does not see it. Tapping the right half moves forward again, up to the live slide. While a viewer is behind, a **LIVE — zur aktuellen Folie** button jumps them back. Viewers who are on the live slide follow automatically when the presenter moves on.

### Reveals

[Reveal items](deck-syntax.md#reveal-items) are revealed **per viewer**: when the presenter moves to a slide, its reveal list starts empty, and each tap on the right half shows the next item. The presenter does not step reveals remotely. Going back to an earlier slide shows all its items at once.

## Signals from the audience

Viewers send signals from the **Optionen** sheet:

| Signal | Viewer action | What the presenter gets |
|---|---|---|
| Reaction | **👍 Resoniert** | a live reaction on the current slide |
| Question | **Frage stellen** (max. 280 characters) | the question text, live |
| Bookmark | **Merken** | a bookmark count for the slide |
| Re-open | coming back to the tab or reloading (automatic) | a re-open count (a sign the deck is being reread) |

Signals are anonymous: eigen.beam stores no viewer identity. The API also accepts the reactions 🔥 💡 ❤️ 👏 ❓; anything else is recorded as 👍.

The remote's header shows how many viewers are connected (**● N live**) and the speaker notes for the current slide. Counts (**dabei**, **Fragen**, **Merker**, **Re-Open**) and the signal feed sit in the **Coach öffnen** panel, closed by default so the remote stays calm during the talk. `/present/:id/stats` has a larger field-test dashboard with peak concurrency and re-open rate.

## Ending a session

A room ends when:

- the presenter confirms **Session beenden** in the remote, either from the **Session** menu or in place of **Weiter** on the final slide; the client then calls `DELETE /present/:id/slide` (see the [HTTP API](http-api.md#end-a-room));
- it has been idle for 12 hours;
- the instance already holds 500 rooms and a new one starts (ended rooms are evicted first, then the least recently active room);
- the server restarts or redeploys ([ADR 0002](adr/0002-in-memory-live-rooms.md)).

The confirmation explains that every viewer moves to the end screen. If the room has questions, the presenter can choose **Exportieren und beenden** or explicitly end without an export. The client first waits for the successful `DELETE` (or its `410 already_ended` retry response), adopts the server-owned end summary and then starts the question download as a navigation. Offline and server errors keep the remote live and offer retry; the UI never claims the room ended before the server acknowledges it.

Open viewer and presenter streams receive `ended` and close. A viewer that was offline at that moment receives the same one-shot `ended` event when EventSource reconnects. Viewers then see a dedicated end screen with **Replay ansehen** as the single primary action.

Ended rooms stay in memory for `EB_ENDED_ROOM_TTL_MS` (30 minutes by default, minimum 5 seconds). Invalid or shorter values fall back to the default with a boot warning. During that window presenter reloads and other presenter tabs see the same server-owned end summary and can still export question text. A periodic unref'ed sweep, with a minimum interval of 10 seconds, removes expired ended rooms. Capacity eviction also removes ended rooms before active idle rooms.

After a sweep or process restart, viewer routes fall back to the activity store. A persisted replay still produces the end screen. PIN replays stored after migration 005 accept the existing signed unlock cookie or verify a newly entered PIN against a persisted HMAC verifier; the raw PIN is never stored. Protected rows created before migration 005 have no verifier and are treated as unknown (`410`), so the UI does not offer an impossible PIN prompt. Rotating `EB_MAGIC_LINK_SECRET` invalidates stored PIN verifiers and leaves affected protected replays locked. Without `EB_ACTIVITY_STORE=postgres`, a restart loses both live status and replay fallback, so the viewer returns the normal friendly `410` once no in-memory room remains.

## After the session

| Page | URL | What it shows |
|---|---|---|
| Replay | `/replay/:roomId` | timeline, summary, slide heatmap, follow-up pack, deck-v2 draft, session coach |
| Recap | `/recap/:deckId` | the deck itself, clonable, with a follow opt-in |

The replay is public to anyone with the link (PIN rooms: only with the PIN cookie). It contains slide numbers, reaction emojis, bookmark and re-open events, but **question texts are blanked** and speaker notes are never included. See the [tutorial](tutorials/replay-to-follow-up.md) and the [replay endpoints](http-api.md#replays).

Replays outlive the room only with `EB_ACTIVITY_STORE=postgres`. Without it, the replay disappears together with the in-memory room.

## Limits

| Limit | Value | When exceeded |
|---|---|---|
| Viewers per room | 300 concurrent | stream returns `503 busy` |
| Presenter streams per room | 10 | stream closes |
| Rooms per instance | 500 | ended room first, otherwise oldest idle room is closed |
| Idle room lifetime | 12 hours | room is closed |
| Ended room lifetime | 30 minutes by default, minimum 5 seconds | room is removed; configure with `EB_ENDED_ROOM_TTL_MS` |
| Viewer signals | 60 per minute per IP and room | `429` |
| Rooms created | 30 per 10 minutes per IP | `429` |

All counters are per process and reset on restart.

## Related

- [Tutorial: your first deck](tutorials/first-deck.md)
- [Architecture](architecture.md) and the [ADRs](adr/README.md)
- [HTTP API](http-api.md#live-rooms)
- [Privacy](privacy.md)
