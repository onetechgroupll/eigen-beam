# Editor and Agent Setup

This repo is optimized for simple repo-local setup rather than global shell state.

## Claude Code / MCP

The repo commits `.mcp.json`:

```json
{
  "mcpServers": {
    "eigenbeam": {
      "command": "./scripts/eigenbeam-mcp.sh"
    }
  }
}
```

The wrapper:

- works for GUI apps that do not inherit an interactive shell PATH;
- reads a bearer token from `EB_MCP_TOKEN` or an ignored local token file;
- connects to the `/mcp` endpoint from `EB_MCP_URL` or `.data/secrets/eigenbeam-mcp-url.txt` (default: local dev server);
- never commits the token.

Default ignored token file:

```text
.data/secrets/eigenbeam-mcp-token.txt
```

Create it locally as a single-line token when needed. Do not commit `.data/`.

## Coding agents

Follow `AGENTS.md` and the docs index. Important rules for agents:

- run `bun run check` as the canonical gate;
- use `bun run verify:c1a` and relevant smokes before declaring done;
- do not deploy/restart during a real live presentation;
- keep presenter tokens out of URLs and public JSON.

## VS Code / Cursor

No repo-specific `.vscode` settings are required today. Recommended editor capabilities:

- Svelte language support;
- TypeScript diagnostics;
- Markdown preview;
- YAML syntax support for GitHub Actions;
- Playwright trace/screenshot viewing when debugging QA.

If project-specific settings become necessary, add minimal `.vscode/extensions.json` or `.vscode/tasks.json` rather than personal editor preferences.

## Local secrets

Never commit:

- `.env` or `.env.*` except `.env.example`;
- `.data/`;
- MCP token files;
- provider API keys;
- database, bucket or mail credentials.

Run:

```bash
bun run doctor
```

before deeper debugging; it catches common missing-tool/env issues without printing secrets.
