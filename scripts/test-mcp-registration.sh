#!/usr/bin/env bash
# Claude Code MCP registration lifecycle: add -> get -> list -> duplicate -> remove.
# Uses a throwaway server name; never touches your real "dexalot-trade" entry.
#
#   NODE=$(command -v node) ./scripts/test-mcp-registration.sh
set -uo pipefail

NODE="${NODE:-$(command -v node)}"   # absolute path; GUI clients need it, CLI is fine either way
MCP="${MCP:-$(cd "$(dirname "$0")/.." && pwd)/packages/mcp/dist/index.js}"
NAME="${NAME:-dexalot-test}"

command -v claude >/dev/null || { echo "claude CLI not found on PATH"; exit 1; }
[ -f "$MCP" ] || { echo "build first: pnpm build ($MCP missing)"; exit 1; }

echo "== 0. pre-clean (in case a prior run left it) =="
claude mcp remove "$NAME" >/dev/null 2>&1 || true

echo "== 1. ADD =="
claude mcp add "$NAME" -- "$NODE" "$MCP" --read-only --network devnet --modules market

echo "== 2. GET (config + health) =="
claude mcp get "$NAME"

echo "== 3. LIST (our entry) =="
claude mcp list | grep "$NAME" || echo "  not in list"

echo "== 4. DUPLICATE add (should refuse) =="
claude mcp add "$NAME" -- "$NODE" "$MCP" --read-only --modules market || echo "  ^ refused as expected"

echo "== 5. REMOVE =="
claude mcp remove "$NAME"

echo "== 6. CONFIRM GONE =="
claude mcp get "$NAME" 2>&1 | head -1

echo "Done. Your remaining dexalot entries:"
claude mcp list | grep -i dexalot || true
