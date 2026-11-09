# AGENTS.md

Rules for coding agents (Claude Code, Codex and others) working in this repository. Kept short on purpose; depth lives in `docs/` (start at `docs/index.md`).

## Context

eigen.beam: mobile live-sync presentations. The presenter steers from a phone, the audience follows live on their own phones over SSE. Vertical-native, zero join friction, content first. SvelteKit with `adapter-node`, one Node process, default branch `main`. MIT licensed.

## Commands (use exactly these)

| Purpose | Command |
|---|---|
| Install | `bun install` |
| Typecheck (canonical gate) | `bun run check` |
| Repository verification | `bun run verify:c1a` |
| Build | `bun run build` |
| Docs check | `bun run docs:check` |
| Local production smokes | see `docs/testing.md` |

There is no unit-test runner yet. Done means `bun run check` with 0 errors, `bun run verify:c1a` green and, for UI or live-flow changes, the browser smokes green. If a test runner is added, it is vitest via `bun run test`; never `bun test` (Bun's native runner differs in mock and timer semantics).

## Stack (fixed)

SvelteKit (`adapter-node`) · Svelte 5 runes · TypeScript · Bun · SSE, no WebSockets · in-memory live rooms · Postgres and S3-compatible storage in production. Decisions: `docs/adr/`.

## Hard don'ts

- Replacing SSE with WebSockets. Stay asymmetric: viewer → POST, server → SSE.
- `setSlide` without clamping to `[0, slides.length - 1]`; an out-of-range index shows a blank slide to a live audience.
- Swallowing SSE write errors (`catch {}`). Reap the dead connection (unsubscribe, clear the interval, close) and broadcast over a snapshot of subscribers.
- Putting presenter tokens in URLs, viewer payloads, exports or MCP responses.
- Adding viewer chrome that competes with the slide (`docs/design-system.md`).
- `git add -A`, `--no-verify` or other destructive git shortcuts.
- Committing anything under `.data/`, `reports/` or real env values.

## Security rules

- Presenter token only as an httpOnly cookie scoped to `/present/:id`.
- Room IDs stay unguessable (`nanoid`); keep subscriber caps and room TTLs on.
- Public routes go through public serializers: no speaker notes, raw source, owner IDs or tokens.
- Events and stats carry no PII.

## Before the first edit, read

| You are changing… | Read |
|---|---|
| SSE stream, reconnect, heartbeat | `docs/architecture.md`, `docs/adr/0001-sse-not-websockets.md` |
| Room store, sync, clamp, viewer | `docs/adr/0002-in-memory-live-rooms.md`, `docs/architecture.md` |
| Auth, PIN, magic link, MCP auth | `docs/security.md`, `docs/adr/0003-presenter-auth-httponly-cookie.md` |
| Storage, uploads, buckets | `docs/deployment.md` |
| Viewer UI, theme, slide layout | `docs/design-system.md`, `docs/adr/0004-content-first-mobile-design.md` |
| A roadmap item | `ROADMAP.md` |
