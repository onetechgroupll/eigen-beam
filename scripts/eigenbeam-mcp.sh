#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
TOKEN_FILE="${EB_MCP_TOKEN_FILE:-$REPO_ROOT/.data/secrets/eigenbeam-mcp-token.txt}"
URL_FILE="${EB_MCP_URL_FILE:-$REPO_ROOT/.data/secrets/eigenbeam-mcp-url.txt}"

# Endpoint: EB_MCP_URL wins, then the ignored URL file, then a local dev server.
if [[ -n "${EB_MCP_URL:-}" ]]; then
  MCP_URL="$EB_MCP_URL"
elif [[ -s "$URL_FILE" ]]; then
  MCP_URL="$(tr -d '\n\r' < "$URL_FILE")"
else
  MCP_URL="http://localhost:5173/mcp"
fi

# GUI apps on macOS often do not inherit the interactive shell PATH. Include the
# common Node/Bun/Homebrew locations so Claude Code on macOS
# can launch this wrapper without manual terminal setup.
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if [[ -n "${EB_MCP_TOKEN:-}" ]]; then
  ACCESS_TOKEN="$(printf '%s' "$EB_MCP_TOKEN" | tr -d '\n\r')"
elif [[ -s "$TOKEN_FILE" ]]; then
  ACCESS_TOKEN="$(tr -d '\n\r' < "$TOKEN_FILE")"
else
  echo "Missing eigen.beam MCP token." >&2
  echo "Create $TOKEN_FILE with the bearer token as a single line," >&2
  echo "or launch Claude Code with EB_MCP_TOKEN set." >&2
  exit 1
fi

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Empty eigen.beam MCP token." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Missing npx. Install Node.js, or adjust PATH in scripts/eigenbeam-mcp.sh." >&2
  exit 1
fi

exec npx -y mcp-remote "$MCP_URL" \
  --transport http-only \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  --silent
