# ADR 0006: Import and AI work stays off the live path

Status: Accepted

## Context

PDF/PPTX import, voice-to-slides and AI "clarify" passes are slow and can fail. A live session must not stall because a provider is slow.

## Decision

- Imports, clarity passes and deck generation run while authoring, before a room exists. A room starts from a frozen deck snapshot.
- AI features have deterministic local fallbacks (for example the Ready Check heuristics and the local clarify path). `ANTHROPIC_API_KEY` is optional; only voice-to-slides strictly needs a transcription key (`OPENAI_API_KEY`).
- Replay artifacts (summary, heatmap, follow-up pack, deck v2) are computed after the session from persisted events.

## Consequences

- Editing a deck during a live session does not change the running room.
- Every core flow works without any AI provider configured.
