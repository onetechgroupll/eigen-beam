# Using eigen.beam from Claude Code

The repository contains a project-scoped MCP setup. Claude Code reads `.mcp.json` and starts the wrapper `scripts/eigenbeam-mcp.sh`, which bridges to your instance's `/mcp` endpoint via `mcp-remote`. No JSON to copy.

## Setup

1. Pick the instance. By default the wrapper talks to a local dev server at `http://localhost:5173/mcp`. To use another instance, put its MCP URL into an ignored file:

   ```bash
   mkdir -p .data/secrets
   echo "https://beam.example.com/mcp" > .data/secrets/eigenbeam-mcp-url.txt
   ```

2. Store a bearer token that the instance accepts (`EB_MCP_TOKEN` / `EB_MCP_TOKENS` on the server):

   ```bash
   printf '%s' "<token>" > .data/secrets/eigenbeam-mcp-token.txt
   ```

   For local development, start the dev server with a token, for example `EB_MCP_TOKEN=dev-token bun run dev`.

3. Open the project in Claude Code (restart it if it was already open) and approve the project MCP server `eigenbeam`.

`.data/` is ignored by git. `.mcp.json` and the wrapper contain no secrets. Environment overrides: `EB_MCP_URL`, `EB_MCP_TOKEN`, `EB_MCP_URL_FILE`, `EB_MCP_TOKEN_FILE`.

## Tools

Claude sees `create_deck`, `get_deck`, `update_deck`, `create_room` and `upload_asset`. A typical flow:

1. `create_deck` builds a deck from Markdown.
2. `get_deck` reads it back, including the source.
3. `update_deck` writes a new version.
4. `create_room` starts a live session and returns `viewerUrl` and `replayUrl`.
5. `upload_asset` uploads a base64 image and returns a Markdown image line.

Details: [`mcp.md`](mcp.md).

## Example prompts

```text
Use eigenbeam to create a 5-slide deck about our Q3 results. Give me the editUrl.
```

```text
Read eigenbeam deck <id>, cut every slide down to one idea and update it.
```

```text
Start a PIN-protected eigenbeam room for deck <id> and give me the viewer link.
```

## Debugging

```bash
python3 -m json.tool .mcp.json >/dev/null
bash -n scripts/eigenbeam-mcp.sh
test -s .data/secrets/eigenbeam-mcp-token.txt
bun run smoke:mcp
claude mcp list
```

Before the first approval `claude mcp list` shows `eigenbeam: ./scripts/eigenbeam-mcp.sh - Pending approval`; approve it in Claude Code. Started directly in a terminal, the wrapper waits for stdio input; that is expected.
