#!/usr/bin/env bash
# Drive the MCP server over stdio JSON-RPC: handshake -> tools/list -> read calls.
# Uses an ephemeral throwaway wallet for the signed call (no funds, no writes).
#
#   ./scripts/test-mcp-stdio.sh
set -uo pipefail

MCP="${MCP:-$(cd "$(dirname "$0")/.." && pwd)/packages/mcp/dist/index.js}"
[ -f "$MCP" ] || { echo "build first: pnpm build ($MCP missing)"; exit 1; }
export DEXALOT_PRIVATE_KEY=$(node -e "console.log(require('ethers').Wallet.createRandom().privateKey)")

printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
'{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"system_get_capabilities","arguments":{}}}' \
'{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"market_get_pairs","arguments":{}}}' \
'{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"portfolio_get_all_balances","arguments":{}}}' \
| node "$MCP" --network devnet --modules all 2>/dev/null \
| node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{
  const peek=id=>{for(const l of b.split("\n")){if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{continue}
    if(m.id===id)return m;}return null;};
  const txt=m=>(m&&m.result&&m.result.content&&m.result.content[0]&&m.result.content[0].text||"").replace(/\s+/g," ").slice(0,60);
  const init=peek(1); console.log("initialize ->", init&&init.result?init.result.serverInfo?.name||"ok":"FAIL");
  const list=peek(2); console.log("tools/list ->", list?(list.result.tools||[]).length+" tools":"FAIL");
  console.log("system_get_capabilities ->", txt(peek(3)));
  console.log("market_get_pairs ->", txt(peek(4)));
  console.log("portfolio_get_all_balances ->", txt(peek(5)));
})'
unset DEXALOT_PRIVATE_KEY
