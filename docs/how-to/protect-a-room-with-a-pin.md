# How to protect a room with a PIN

Make a live room, and its replay, readable only for people who know a PIN.

## Prerequisites

- A deck you own, open in the editor. Starting the session saves it first.

## Steps

1. Open the deck in the editor (`/new` or `/edit/<deckId>`).
2. Enter a PIN in **PIN optional** (up to 24 characters, for example `4711`).
3. Click **N Folien live starten →** next to it.
4. Share the audience link and tell the room the PIN separately, out loud or on a slide.

From a script, pass the PIN when you create the room:

```json
POST /api/rooms
{ "deckId": "<deckId>", "pin": "4711" }
```

## What the PIN protects

| Surface | Without the PIN |
|---|---|
| `/v/:roomId` viewer | shows only a PIN prompt, no slides |
| `/v/:roomId/stream` and `/v/:roomId/event` | `403` |
| `/replay/:roomId` and all `/api/replay/:roomId/*` | `403` |

After a correct PIN, the browser holds an `eb_pin_<roomId>` cookie for 12 hours. It unlocks the live room and its replay.

The PIN can be entered while the room is still in memory (live, or ended but not yet evicted), and — for replays stored after the `pin_verifier` migration — also after a restart or eviction, because the replay keeps a keyed verifier for exactly this case. Replays stored before that migration stay closed once the room is gone; after the unlock cookie expires, `/replay/:roomId` answers `403`. Save the summary or follow-up as Markdown while you still have access.

The PIN does **not** protect the deck itself. The recap (`/recap/:deckId`), share page and exports follow the deck's visibility; keep the deck `private` if its content is confidential ([how to share and export](share-and-export.md)).

## Verification

Open the audience link in a private browser window. You should see the PIN prompt instead of the slide. Enter a wrong PIN: `Falsche PIN.` Enter the right one: the live slide appears.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Falsche PIN.` although it is right | PINs are compared exactly, after trimming spaces | check digits and case |
| `Zu viele Anfragen.` | more than 10 attempts in 10 minutes from one IP | wait for the `retry-after` time |
| Replay returns `403` the next day | the unlock cookie lasts 12 hours | enter the PIN on `/v/:roomId` — for replays with a stored PIN verifier this works even after a restart; replays from before the verifier migration stay closed |
| The PIN cannot be changed | a room's PIN is fixed at start | start a new room |

## Related

- [Live sessions](../live-sessions.md)
- [Security](../security.md)
