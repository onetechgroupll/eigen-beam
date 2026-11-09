# Fixtures and Example Data

Safe, committed examples live under [`../examples/`](../examples/).

## Example decks

| File | Use |
|---|---|
| [`demo-deck.md`](../examples/demo-deck.md) | Small product demo deck for the core live-sync story. |
| [`high-stakes-pitch.md`](../examples/high-stakes-pitch.md) | Five-minute screenless customer-pitch skeleton. |
| [`retail-media-mini-deck.md`](../examples/retail-media-mini-deck.md) | Retail-media conversation example. |

## MCP payload examples

| File | Use |
|---|---|
| [`mcp-create-deck.json`](../examples/mcp-create-deck.json) | Example `create_deck` tool-call payload. |
| [`mcp-create-room.json`](../examples/mcp-create-room.json) | Example `create_room` tool-call payload. |

## Using examples manually

1. Open `/new`.
2. Paste one of the Markdown examples into the Markdown path.
3. Check **READY CHECK**.
4. Start a live room and test presenter/viewer sync.

## Using examples with MCP

See [`tutorials/mcp-create-and-launch.md`](tutorials/mcp-create-and-launch.md).

Keep examples:

- short enough to scan in a PR;
- free of secrets, customer-private data and personal data;
- mobile-first: one idea per slide, short headlines, speaker notes separated from public content.
