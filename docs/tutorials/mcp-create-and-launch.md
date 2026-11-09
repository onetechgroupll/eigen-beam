# Tutorial: create and launch a deck through MCP

AI clients can create a deck, update it and start a viewer room through an instance's MCP endpoint (your local dev server or a hosted instance).

## Setup

See [`../mcp.md`](../mcp.md) and [`../mcp-claude-code.md`](../mcp-claude-code.md).

Claude Code should see the server name:

```text
eigenbeam
```

## Flow

1. Call `create_deck` with vertical, mobile-first Markdown.
2. Call `get_deck` to read back the source.
3. Optionally call `update_deck` after editing.
4. Call `create_room` to get `viewerUrl` and `replayUrl`.

Important: `create_room` never returns presenter tokens.

## Smoke

```bash
bun run smoke:mcp
```

Mutating smoke (creates a test deck, room and asset on the configured instance), only when intentionally desired:

```bash
EB_MCP_SMOKE_MUTATE=1 bun run smoke:mcp
```

## Example payloads

- [`../../examples/mcp-create-deck.json`](../../examples/mcp-create-deck.json)
- [`../../examples/mcp-create-room.json`](../../examples/mcp-create-room.json)
