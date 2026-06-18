#!/usr/bin/env node
// Demo 3 — MCP server over stdio (no extra deps; uses Node built-ins only).
// Drives the real MCP JSON-RPC handshake: initialize -> list tools -> call tools.
//
//   node demos/demo-mcp.mjs                                  # published @dexalot/trade-mcp via npx
//   DEXALOT_MCP="node packages/mcp/dist/index.js" node demos/demo-mcp.mjs   # local build
//   NETWORK=testnet node demos/demo-mcp.mjs
//
// Runs --read-only (no wallet needed). For signed tools, drop --read-only and
// set up a profile / DEXALOT_PRIVATE_KEY, then call e.g. portfolio_get_all_balances.
import { spawn } from "node:child_process";

const NETWORK = process.env.NETWORK || "mainnet";
const serverCmd = (process.env.DEXALOT_MCP || "npx -y @dexalot/trade-mcp").split(" ");
const serverArgs = ["--read-only", "--network", NETWORK, "--modules", "market,analytics,portfolio"];

const child = spawn(serverCmd[0], [...serverCmd.slice(1), ...serverArgs], {
  stdio: ["pipe", "pipe", "inherit"], // stderr (server logs) passthrough
});

let buf = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

const rpc = (method, params) => new Promise((resolve) => {
  const id = nextId++;
  pending.set(id, resolve);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
});
const notify = (method, params) =>
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

const callTool = async (name, args = {}) => {
  const res = await rpc("tools/call", { name, arguments: args });
  const text = res.result?.content?.find((c) => c.type === "text")?.text ?? "";
  return text;
};

(async () => {
  console.log(`=== Dexalot MCP demo (${NETWORK}, --read-only) ===\n`);

  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "dexalot-mcp-demo", version: "0.0.0" },
  });
  console.log("initialize ->", init.result?.serverInfo);
  notify("notifications/initialized", {});

  const list = await rpc("tools/list", {});
  const tools = list.result?.tools ?? [];
  console.log(`\ntools/list -> ${tools.length} tools, e.g.:`);
  console.log("  " + tools.slice(0, 8).map((t) => t.name).join(", ") + " ...");

  console.log("\ncall system_get_capabilities:");
  console.log(await callTool("system_get_capabilities"));

  console.log("\ncall market_get_pairs (first ~400 chars):");
  console.log((await callTool("market_get_pairs")).slice(0, 400));

  console.log("\ncall market_get_orderbook { pair: 'ALOT/USDC' } (first ~300 chars):");
  console.log((await callTool("market_get_orderbook", { pair: "ALOT/USDC" })).slice(0, 300));

  console.log("\ncall analytics_get_24h_stats (first ~300 chars):");
  console.log((await callTool("analytics_get_24h_stats")).slice(0, 300));

  console.log("\n✅ MCP demo complete");
  child.stdin.end();
  child.kill();
  process.exit(0);
})();
