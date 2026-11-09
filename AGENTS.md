# AGENTS.md — onetechgroupll/eigen-beam

Projekt-Regeln für Coding-Agents (Codex, Claude Code u.a.). Bewusst knapp;
tiefe Doku liegt unter `docs/` (Einstieg: `docs/index.md`).

## Repo-Kontext

eigen.beam — mobile Live-Sync-Präsentation: Presenter steuert, das Publikum folgt
live auf den eigenen Phones (SSE), vertikal-nativ, zero-friction, Content-First.
SvelteKit + `adapter-node` auf Railway. Default-Branch `main`. Live:
`eigen-beam-production.up.railway.app`. Side-Project von Lucas Lingens, MIT-lizenziert.
**Off-limits:** NICHT zu Railway deployen während einer laufenden Live-Präsentation
(Rooms sind In-Memory, Restart killt aktive Sessions). Roadmap/Architektur:
`docs/eigenbeam-roadmap-2026-06-28.md`.

## Commands (exakte Invocation — nutze diese, nicht raten)

| Zweck | Command |
|---|---|
| Install | `bun install` |
| Typecheck | `bun run check` |
| Lint | — (keine ESLint-Config; svelte-check deckt Typen + a11y-Warnings) |
| Test (KANONISCH — Verifikations-Gate) | `bun run check` (bis vitest kommt) |
| Build | `bun run build` |

Kein Test-Runner installiert. **Done-Gate heute = `bun run check` (svelte-check,
0 Errors)** + manueller/headless SSE-Sync-Smoke. Sobald Tests kommen (Build-Paket
C1a): vitest via **`bun run test`**, NIE `bun test` — Buns nativer Runner divergiert
bei Mock-/Timer-Semantik. `TASK_STATUS: DONE` erst bei grünem `bun run check`.

## Stack (gelocked)

SvelteKit (`adapter-node`) · Svelte 5 (Runes) · TypeScript · bun · **SSE, kein
WebSocket** · In-Memory-Room-Store · Railway (Hosting; Postgres + Buckets geplant) ·
Content-First-Design (Auto-Theme via `prefers-color-scheme`, Lime-Signaturakzent).

## Hard Don'ts (Review-Reject)

- `bun test` als Gate nutzen — *stattdessen:* `bun run check` (später `bun run test` = vitest).
- SSE zu WebSocket umbauen — *stattdessen:* asymmetrisch bleiben (Viewer→POST, Server→SSE); der Live-Layer ergänzt nur einen Presenter-SSE-Stream.
- `setSlide` ohne Index-Clamp — *stattdessen:* immer auf `[0, slides.length-1]` clampen (sonst weiße Slide vor Publikum).
- SSE-Schreibfehler schlucken (`catch {}`) — *stattdessen:* die tote Verbindung reapen (unsub + clearInterval + close); Broadcast über Snapshot iterieren.
- Zu Railway deployen während einer Live-Präsentation — *stattdessen:* zwischen Sessions (In-Memory-Rooms).
- Content-First brechen (Chrome das mit der Folie um Aufmerksamkeit kämpft) — *stattdessen:* Overlay/asynchron, nie ein Panel.
- `git add -A` · `--no-verify` · destruktive Git-Shortcuts.

## Security-Hard-Rules

eigen.beam hat eine öffentliche URL + Presenter-Steuer-Surface:

- Presenter-Token NUR via httpOnly-Cookie (scoped auf `/present/:id`), NIE im Query-String.
- Room-IDs unguessable (`nanoid`), Subscriber-Cap pro Room, Room-TTL/Cap aktiv lassen.
- `events`/Stats ohne PII.

## Pre-Build-Lookup (PFLICHT vor dem ERSTEN Edit — nicht optional)

Diese Pages haben die konkreten Anti-Pattern, die auch test-grünen Code reissen.
"AGENTS.md gelesen" reicht NICHT.

| Du baust/änderst… | Pflicht-Lookup |
|---|---|
| SSE-Stream / Reconnect / Heartbeat | `docs/architecture.md` + Hard Don'ts oben (tote Verbindungen reapen) |
| Room-Store / Sync / Clamp / Viewer | `docs/eigenbeam-design-2026-06-28.md` (Architektur) |
| Storage / Bild-Upload / Buckets | `docs/deployment.md` (Railway Buckets, S3-kompatibel) |
| Neues Feature aus dem Plan | `docs/eigenbeam-roadmap-2026-06-28.md` (Build-Plan + Foundation-Architektur) |
| Viewer-UI / Theme / Slide-Layout | `docs/eigenbeam-design-2026-06-28.md` (Content-First-Design-System) |

## Doku-Index

| Thema | Wo |
|---|---|
| Einstieg | `docs/index.md` |
| Architektur | `docs/architecture.md` |
| Build-Plan + Foundation-Architektur | `docs/eigenbeam-roadmap-2026-06-28.md` |
| Design-Doc (SSE/Tests/Design-System) | `docs/eigenbeam-design-2026-06-28.md` |
| Deployment / Env | `docs/deployment.md` |
| Security / Public Surface | `docs/security.md` |
