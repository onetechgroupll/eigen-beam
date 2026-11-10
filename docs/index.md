# eigen.beam documentation

Start with the [README](../README.md) for what eigen.beam is and a two-minute quickstart.

## Reading paths

### I want to write and present decks

1. [`tutorials/first-deck.md`](tutorials/first-deck.md): write a deck, present it, follow it on a second screen.
2. [`deck-syntax.md`](deck-syntax.md): every line type, directive, slide type and limit.
3. [`live-sessions.md`](live-sessions.md): what presenter and viewers see, audience signals, ending, replays, limits.

### How-to guides

1. [`how-to/import-content.md`](how-to/import-content.md): turn a PDF, PowerPoint or voice recording into a deck.
2. [`how-to/protect-a-room-with-a-pin.md`](how-to/protect-a-room-with-a-pin.md): PIN-protect a live room and its replay.
3. [`how-to/share-and-export.md`](how-to/share-and-export.md): visibility, share links, export, clone.

### I want to script it

1. [`http-api.md`](http-api.md): every HTTP endpoint with auth, limits and errors.
2. [`mcp.md`](mcp.md): the authenticated tool surface for AI clients.

### I want to run it and change it

1. [`development.md`](development.md): first ten minutes, daily loop, reset and recovery.
2. [`scripts.md`](scripts.md): every script and the env vars it reads.
3. [`testing.md`](testing.md): typecheck, build, smokes and mobile QA.
4. [`troubleshooting.md`](troubleshooting.md): common local, CI, deployment, MCP and WebKit issues.
5. [`../CONTRIBUTING.md`](../CONTRIBUTING.md): how to open a good pull request.

### I want to host my own instance

1. [`deployment.md`](deployment.md): Docker, Railway and other hosts; minimal vs. production mode; full env reference.
2. [`operations.md`](operations.md): `/healthz`, `/readyz`, smokes and the watchdog.
3. [`upgrading.md`](upgrading.md): backups, migrations, rollback windows and breaking releases.
4. [`security.md`](security.md) and [`privacy.md`](privacy.md): what a public instance exposes and stores.

### I want to understand the design

1. [`architecture.md`](architecture.md): system diagram, live-room model, stores and auth boundaries.
2. [`adr/`](adr/README.md): the decisions behind it (SSE, in-memory rooms, cookie auth, content-first, single service, heavy work off the live path).
3. [`design-system.md`](design-system.md): theme, type, chrome and viewer states.
4. [`../ROADMAP.md`](../ROADMAP.md): what is shipped, what is next, what is out of scope.
5. [`designs/oss-adoption.md`](designs/oss-adoption.md): the plan for the next phase and why.

### I want to connect an AI client

1. [`mcp.md`](mcp.md): endpoint, auth, scopes and tools.
2. [`mcp-claude-code.md`](mcp-claude-code.md): project-scoped Claude Code setup.
3. [`editor-and-agent-setup.md`](editor-and-agent-setup.md): editor and coding-agent conventions for this repo.

### Tutorials and examples

1. [`tutorials/first-deck.md`](tutorials/first-deck.md): your first deck, live on two screens.
1. [`tutorials/manual-live-session.md`](tutorials/manual-live-session.md): run the core presenter/viewer flow, including a production-like build.
2. [`tutorials/import-to-live-room.md`](tutorials/import-to-live-room.md): import content and launch a room.
3. [`tutorials/mcp-create-and-launch.md`](tutorials/mcp-create-and-launch.md): create and launch a deck via MCP.
4. [`tutorials/replay-to-follow-up.md`](tutorials/replay-to-follow-up.md): turn a replay into follow-up material.
5. [`../examples/`](../examples/): example decks and MCP payloads; see [`fixtures.md`](fixtures.md).

## All documents

| File | Purpose |
|---|---|
| [`deck-syntax.md`](deck-syntax.md) | Deck format reference |
| [`live-sessions.md`](live-sessions.md) | Presenter, viewers, signals, replays, limits |
| [`http-api.md`](http-api.md) | HTTP endpoint reference |
| [`how-to/`](how-to/import-content.md) | Import, PIN rooms, sharing and export |
| [`development.md`](development.md) | Setup, daily loop, CI-friendly habits |
| [`scripts.md`](scripts.md) | Script and env var reference |
| [`testing.md`](testing.md) | Local, CI, smoke and mobile QA verification |
| [`qa.md`](qa.md) | README screenshots and manual QA checklist |
| [`troubleshooting.md`](troubleshooting.md) | Common issues and fixes |
| [`deployment.md`](deployment.md) | Self-hosting guide and production env |
| [`operations.md`](operations.md) | Health, readiness, smokes, watchdog |
| [`architecture.md`](architecture.md) | System design and boundaries |
| [`adr/`](adr/README.md) | Architecture decision records |
| [`design-system.md`](design-system.md) | Visual language and viewer states |
| [`security.md`](security.md) | Public surfaces, auth model, invariants, reporting |
| [`privacy.md`](privacy.md) | Data use, PII, providers |
| [`mcp.md`](mcp.md) | MCP endpoint and tools |
| [`mcp-claude-code.md`](mcp-claude-code.md) | Claude Code setup |
| [`editor-and-agent-setup.md`](editor-and-agent-setup.md) | Editor and coding-agent setup |
| [`fixtures.md`](fixtures.md) | Example decks and fixture rules |

## Conventions

- The README is the front door; depth lives in `docs/`.
- A new architectural decision gets an ADR in the same PR.
- No secrets in docs or examples: variable names and placeholders only.
- Changing scripts or CI gates means updating [`testing.md`](testing.md) and [`scripts.md`](scripts.md); changing env or migrations means updating [`deployment.md`](deployment.md) and `.env.example`.
- Run `bun run docs:check` before pushing doc changes.
