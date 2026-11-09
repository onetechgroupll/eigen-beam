# Tutorial: turn a session into follow-up

After a live session, eigen.beam keeps a public-safe replay timeline and deterministic follow-up artifacts.

## Flow

1. Run a live room.
2. Let viewers join, react, bookmark or ask questions.
3. Open `/replay/:id`.
4. Review:
   - session summary;
   - slide heatmap;
   - follow-up pack;
   - deck-v2 draft;
   - session coach checklist.
5. Copy the follow-up mail or group-chat draft.

## Verification

```bash
EB_SMOKE_BASE=http://127.0.0.1:4316 bun run smoke:replay
```

Expected result:

```text
SMOKE PASS — 15 checks.
```

## Public-safety rule

Replay/follow-up surfaces must remain public-safe: no raw deck source, owner IDs, presenter tokens or speaker notes.
