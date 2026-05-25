# Dexalot Trade Kit — Architecture

## 1. Overview

Dexalot Trade Kit is an AI-powered trading toolkit for the Dexalot DEX, shipping an MCP server (`@dexalot-trade-kit/mcp`) and a CLI (`@dexalot-trade-kit/cli`). Both binaries share `@dexalot-trade-kit/core` and a single tool registry, so the CLI and the MCP host always return identical results for identical tool calls.

- **Transport (MCP):** stdio JSON-RPC
- **Transport (CLI):** argv → tool runner → stdout
- **Runtime:** Node.js ≥ 18, pnpm ≥ 9
- **Language:** TypeScript (ESM)
- **Build:** tsup (esbuild-based)
- **External SDK:** `@dexalot/dexalot-sdk` (npm), used for on-chain operations and contract reads

## 2. Layered architecture

```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  MCP host                    │  │  User terminal               │
│  (Claude / Cursor / VSCode)  │  │                              │
└──────────────┬───────────────┘  └──────────────┬───────────────┘
               │ stdio JSON-RPC                  │ argv
┌──────────────▼───────────────┐  ┌──────────────▼───────────────┐
│  dexalot-trade-mcp           │  │  dexalot CLI                 │
│  packages/mcp/src/index.ts   │  │  packages/cli/src/index.ts   │
│  → server.ts → ListTools     │  │  → parser → dispatchers      │
│      / CallTool              │  │                              │
└──────────────┬───────────────┘  └──────────────┬───────────────┘
               │                                  │
               └─────────────────┬────────────────┘
                                 │
              ┌──────────────────▼──────────────────┐
              │  @dexalot-trade-kit/core            │
              │  tools/* (13 modules, 79 tools)     │
              │  client/rest-client.ts (mountpoints)│
              │  client/contract-client.ts (SDK)    │
              │  client/merkl-api.ts (external)     │
              │  config.ts + config/toml.ts         │
              │  utils/{rate-limiter,errors,…}.ts   │
              └──────┬──────────────────┬───────────┘
                     │                  │
   ┌─────────────────▼──────┐  ┌────────▼─────────────┐
   │  Dexalot REST API      │  │  @dexalot/dexalot-sdk│
   │  api.dexalot.com       │  │  (ethers v6)         │
   │  api.dexalot-test.com  │  │  Contract reads/writes
   │  api.dexalot-dev.com   │  │  on the Dexalot subnet
   └────────────────────────┘  └──────────────────────┘
```

## 3. Module → tool registry

Every tool is a `ToolSpec`:

```ts
interface ToolSpec {
  name: string;                                          // "market_get_pairs"
  module: ModuleId;                                      // "market" | "clob.read" | "clob.write" | …
  description: string;                                   // ≤ 900 chars; agent activation trigger
  inputSchema: JsonSchema;                               // MCP Tool["inputSchema"]
  isWrite: boolean;                                      // true → dropped by --read-only
  handler: (args, ctx) => Promise<unknown>;              // ctx = { config, client, contract }
}
```

`buildTools(config)` applies two filter passes at startup:
1. **Module filter** — drop tools whose `module` isn't in `config.modules`
2. **Read-only filter** — if `config.readOnly`, drop every `isWrite=true` tool

The CLI gets the same `ToolSpec[]` via `createToolRunner` and translates `dexalot <module> <action> --flag value` into `tool.handler({...flags})`.

## 4. REST mountpoints

`DexalotRestClient` in `packages/core/src/client/rest-client.ts` takes a `mountpoint` parameter on every request. Each mountpoint maps to a sub-path under the network host:

| Mountpoint | Path | Auth | Convenience method |
|---|---|---|---|
| `trade` | `${baseUrl}/trading/` | none | `tradeGet`, `tradePost` |
| `signed` | `${baseUrl}/trading/signed/` | `x-signature: <addr>:<sig>` | `signedGet`, `signedPost` |
| `swap` | `${baseUrl}/rfq/` | path-conditional | `swapGet` |
| `analytics` | `${baseUrl}/stats/` | none | `analyticsGet` |
| `info` | `${baseUrl}/info/` | none | `infoGet` |
| `merkl` | `https://api.merkl.xyz/v4/` | none (external) | `merklGet` |

**Path-conditional auth on `swap`:**
- `swap_get_firm_quote` (`firmQuote`) → injects `x-signature`
- `swap_get_quote` soft variant (`pairprice`) → injects `x-wallet-address` only
- `swap_get_pairs` → no auth

**Origin header:** Dexalot's REST backend enforces an Origin allow-list — every request also carries `Origin` + `Referer` headers matching the active network's `webUrl` (e.g. `https://app.dexalot.com` for mainnet). Without these, the backend returns "Not allowed by CORS". The REST client injects them automatically for every mountpoint except `merkl`.

## 5. SDK boundary

Anything that submits or reads an on-chain transaction routes through `DexalotContractClient` (a lazy wrapper around `@dexalot/dexalot-sdk`'s `DexalotClient`). REST is used for everything else.

| Tool class | Routes via |
|---|---|
| `clob.write` (place / cancel / replace / batch) | SDK |
| `clob_get_order_by_client_id` | SDK (no REST equivalent) |
| `clob.read` (other) | REST `signed/` |
| `swap.*` | SDK (handles chain resolution + token normalization) |
| `transfer.{deposit,withdraw,add_gas,remove_gas,transfer_portfolio,get_deposit_bridge_fee,get_token_details}` | SDK |
| `transfer.get_combined_transfers` | REST `signed/` |
| `portfolio.{get_balance,get_all_balances,get_chain_balance(s),get_all_chain_balances}` | SDK |
| `portfolio.{get_token_usd_prices,…history,get_balance_proof}` | REST |
| `market.*`, `analytics.*`, `info.*`, `leaderboard.*`, `vaults.*`, `trader_history.*`, `rewards.{subnet,breakdown,…}`, `pnl.*` | REST |
| `rewards.get_stake_merkl` | external merkl-api |

The SDK is initialized **lazily** on the first call that needs it. Tools that never touch the chain never pay the deployment-fetching cost.

### SDK base URL quirk

`@dexalot/dexalot-sdk` prepends its own `/privapi/...` and `/api/...` path prefixes to whatever `apiBaseUrl` it receives. Our REST client uses `https://api.dexalot.com/api` as the base (because our mountpoints sit under `/api`), so `DexalotContractClient` strips the trailing `/api` before handing the base URL to the SDK. See `packages/core/src/client/contract-client.ts`.

## 6. Auth

The connected wallet signs the static message `"dexalot"` (`DEXALOT_SIGNATURE_MESSAGE`) **once** on the first signed REST request. The result is cached as `<address>:<signature>` and reused for every subsequent signed call (SIGNED_API and SWAP_API `firmQuote`).

- Lazy: tools that don't need a wallet never trigger the signature.
- `--read-only` with no private key starts cleanly; signed tools throw `ConfigError` with actionable guidance only when invoked.
- Timestamped auth (`config.timestampedAuth = true`, env `DEXALOT_TIMESTAMPED_AUTH`) is supported but disabled by default until the backend confirms acceptance.

## 7. Error hierarchy

All errors extend `DexalotMcpError`. `toToolErrorPayload(error)` serializes any error into:

```json
{
  "tool": "...",
  "error": true,
  "type": "DexalotApiError",
  "code": "404",
  "message": "...",
  "suggestion": "...",
  "endpoint": "GET orders",
  "traceId": "...",
  "timestamp": "..."
}
```

Hierarchy:

```
DexalotMcpError
├── ConfigError              # missing key, bad TOML, bad network
├── ValidationError          # bad tool args
├── AuthenticationError      # signature / x-signature rejected
├── RateLimitError           # client-side bucket exhausted
├── DexalotApiError          # backend rejected request
├── ChainError               # on-chain / RPC failure surfaced by the SDK
└── NetworkError             # fetch timeout / non-JSON / dropped
```

A pattern→suggestion table (`DEXALOT_ERROR_SUGGESTIONS`) enriches error messages with actionable hints (insufficient balance, region restriction, pair not found, quote expired, signature rejected, rate limited).

## 8. Rate limiting

Token-bucket per `key` in `packages/core/src/utils/rate-limiter.ts`. Factories in `tools/common.ts`:

| Factory | Default RPS |
|---|---|
| `publicRateLimit(key, rps=10)` | 10 |
| `signedRateLimit(key, rps=5)` | 5 |
| `swapRateLimit(key, rps=5)` | 5 |
| `merklRateLimit(key, rps=1)` | 1 |

Each tool handler picks the factory matching its mountpoint. Callers block transparently up to `maxWaitMs` (30 s default), then throw `RateLimitError`.

## 9. Capability snapshot

Every MCP tool response carries:

```ts
interface CapabilitySnapshot {
  readOnly: boolean;
  hasAuth: boolean;
  hasWallet: boolean;
  network: "mainnet" | "testnet" | "devnet";
  address?: string;
  moduleAvailability: Record<ModuleId, { status: "enabled" | "disabled" | "requires_auth"; reasonCode?: string }>;
}
```

A meta-tool `system_get_capabilities` returns the same shape on demand. Agents adapt strategy based on this — never assume a tool is available without checking the snapshot.

## 10. Networks

| `--network` | API base | WS (v2) | SDK `parentEnv` (default) |
|---|---|---|---|
| `mainnet` | `https://api.dexalot.com/api` | `wss://api.dexalot.com/api/ws` | `production-multi-avax` |
| `testnet` | `https://api.dexalot-test.com/api` | `wss://api.dexalot-test.com/api/ws` | `fuji-multi-avax` |
| `devnet` | `https://api.dexalot-dev.com/api` | `wss://api.dexalot-dev.com/api/ws` | `fuji-multi-avax` (override `api_base_url` to point at devnet) |

WebSocket is **deferred to v2** — REST polling covers the agent flows we need (orderbook, open orders, balances, etc.). The frontend's WebSocket topic catalog is documented for the eventual implementation.

## 11. Skills

Markdown files under `skills/<name>/SKILL.md` with YAML frontmatter:

```yaml
---
name: dexalot-<module>
description: "Use this skill when the user asks for: …  Do NOT use for: … (≤900 chars)"
license: MIT
metadata:
  author: dexalot-trade-kit
  version: "0.1.0"
  agent:
    requires:
      bins: ["dexalot"]
    install: [{ id: npm, kind: node, package: "@dexalot-trade-kit/cli@0.1.0", bins: ["dexalot"] }]
---
```

The Codex CLI enforces a 1024-char ceiling on `description`; we target ≤900 chars. A CI test (`packages/cli/test/skill-description-length.test.ts`) fails the build if any skill exceeds the limit.

All skills call the CLI (`dexalot market get-pairs`), not MCP tool names directly. The CLI shares its tool registry with the MCP server, so behavior is identical.

## 12. Key file reference

| Component | Path |
|---|---|
| Entry: MCP server | `packages/mcp/src/index.ts` |
| Entry: CLI | `packages/cli/src/index.ts` |
| Tool registry root | `packages/core/src/tools/index.ts` |
| `ToolSpec` interface | `packages/core/src/tools/types.ts` |
| Per-module tools | `packages/core/src/tools/{market,clob-read,clob-write,swap,portfolio,transfer,analytics,leaderboard,vaults,trader-history,rewards,pnl,info}.ts` |
| REST client | `packages/core/src/client/rest-client.ts` |
| Contract (SDK) wrapper | `packages/core/src/client/contract-client.ts` |
| Merkl external | `packages/core/src/client/merkl-api.ts` |
| Config + TOML | `packages/core/src/config.ts`, `packages/core/src/config/toml.ts` |
| Constants (networks, modules) | `packages/core/src/constants.ts` |
| Error hierarchy | `packages/core/src/utils/errors.ts` |
| Rate limiter | `packages/core/src/utils/rate-limiter.ts` |
| Update notifier | `packages/core/src/utils/update-check.ts` |
| Setup wizard | `packages/core/src/setup.ts` |
| MCP server | `packages/mcp/src/server.ts` |
| CLI parser / dispatchers | `packages/cli/src/parser.ts`, `packages/cli/src/commands/*` |
| Skills | `skills/dexalot-<module>/SKILL.md` |
