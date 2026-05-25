# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dexalot Trade Kit — TypeScript/ESM monorepo shipping an MCP server (`@dexalot-trade-kit/mcp`) and a CLI (`@dexalot-trade-kit/cli`) that wrap the Dexalot DEX. Both binaries share `@dexalot-trade-kit/core`, which owns config, REST + on-chain client wrappers, the tool registry, and the error/rate-limit machinery. A `skills/` tree of Markdown files tells AI agents when and how to invoke the CLI tools.

The codebase follows the established **MCP+CLI shared-tool-registry** pattern (one core, two transport surfaces).

---

## Architecture

### One core, two surfaces

```
MCP host (Claude / Cursor)   ⇄ stdio JSON-RPC ⇄  packages/mcp/src   ┐
User terminal                ⇄ argv          ⇄  packages/cli/src   ┴── @dexalot-trade-kit/core ── REST + SDK ── Dexalot backend
```

Both surfaces are thin: parse input → call into `core/tools/*` → return result. The tool registry is the single source of truth — adding a tool to `tools/<module>.ts` and registering it in `tools/index.ts` exposes it to both the MCP server and the CLI automatically.

### REST mountpoint switch

`DexalotRestClient` (one class) takes a `mountpoint: "trade"|"signed"|"swap"|"analytics"|"info"|"merkl"` on every request. Headers and base path are derived from the mountpoint. Auth is path-conditional on `swap` (`firmQuote` → x-signature, `pairprice` → x-wallet-address only). See [packages/core/src/client/rest-client.ts](packages/core/src/client/rest-client.ts).

### Origin allow-list (gotcha)

Dexalot's REST backend returns "Not allowed by CORS" when `Origin` is missing or unrecognized. `buildHeaders` injects `Origin` + `Referer` matching the active network's `webUrl` automatically. Don't remove this. See the memory file `dexalot-origin-cors.md`.

### SDK boundary

`DexalotContractClient` wraps `@dexalot/dexalot-sdk`'s `DexalotClient` and initializes lazily on first use. Used for: every `clob.write` tool, `clob_get_order_by_client_id`, every `swap.*` tool, every `transfer` write + bridge-fee + token-details read, every `portfolio` balance read. Everything else hits REST directly.

**Important quirk:** the SDK prepends `/privapi/...` and `/api/...` to its `apiBaseUrl`. Our REST client uses `https://api.dexalot.com/api` as the base, so `DexalotContractClient` strips the trailing `/api` before handing the URL to the SDK. See [packages/core/src/client/contract-client.ts:initSdk](packages/core/src/client/contract-client.ts).

### Lazy signature cache

`DexalotRestClient.ensureSignatureHeader()` signs the static string `"dexalot"` once per process and caches `<address>:<signature>`. Reused for every signed REST call. Tools that don't need a wallet (market, analytics, info, swap-pairs, swap-soft-quote) never trigger signing — `--read-only` with no key works cleanly.

### Tool registry pattern

```ts
interface ToolSpec {
  name: string;          // "market_get_pairs"
  module: ModuleId;      // 13 modules; "clob.read" / "clob.write" are sub-modules
  description: string;   // also used as the skill activation hint (≤900 chars)
  inputSchema: JsonSchema;
  isWrite: boolean;      // true → dropped by --read-only
  handler: (args, { config, client, contract }) => Promise<unknown>;
}
```

`buildTools(config)` filters by `config.modules` then by `config.readOnly`. Both the MCP server and the CLI use the same registry.

### Capability snapshot in every MCP response

Carries `{ readOnly, hasAuth, hasWallet, network, address?, moduleAvailability }`. Agents check this before assuming a tool is available. The `system_get_capabilities` meta-tool returns the same shape on demand.

### Error hierarchy

```
DexalotMcpError
├── ConfigError          ConfigErrors fire early — missing key, bad TOML, bad network
├── ValidationError      Bad tool args
├── AuthenticationError  Signature rejected by backend
├── RateLimitError       Client-side bucket
├── DexalotApiError      Backend rejected the request
├── ChainError           On-chain / RPC failure surfaced from the SDK
└── NetworkError         Fetch failure / non-JSON / timeout
```

`DEXALOT_ERROR_SUGGESTIONS` is a pattern→suggestion table that enriches API errors with actionable text. Used by `suggestForMessage`. The MCP server also has a `WRITE_ACTION_PATTERN` safeguard that appends a warning when any error message hints at write remediations — the agent is instructed not to auto-execute.

---

## Build, test, run

```bash
pnpm install
pnpm build                 # core → mcp → cli (order matters)
pnpm typecheck             # tsc --noEmit across all 3 packages
pnpm test:unit             # node --test via tsx; 151 tests today
pnpm --filter @dexalot-trade-kit/core test:unit    # one package
```

Single test file:
```bash
node --import tsx/esm --test packages/core/test/market.test.ts
```

Run locally:
```bash
node packages/cli/dist/index.js market get-pairs --network devnet
node packages/mcp/dist/index.js --read-only --network devnet --modules market
node packages/mcp/dist/index.js setup --client claude-code
```

**SDK is marked `external` in both mcp and cli tsup configs.** Bundling it triggers `Dynamic require of "ethers" is not supported` because the SDK uses CJS-style require. Don't change this.

**CLI source must NOT start with a shebang.** tsup adds one via `banner: { js: "#!/usr/bin/env node" }`; an inline shebang in `packages/cli/src/index.ts` produces a duplicate that breaks Node ESM loader.

---

## Smoke testing

**Use devnet (`--network devnet`), not testnet, for repeated smoke probes.** The shared testnet host is rate-limited; devnet is internal. Memory: `feedback-use-devnet-for-smoke.md`.

```bash
node packages/cli/dist/index.js market get-pairs --network devnet
node packages/cli/dist/index.js analytics get-24h-stats --network devnet
node packages/cli/dist/index.js leaderboard get-table-parameters --network devnet
```

For signed tools, point to a profile with a `private_key`:

```bash
dexalot config init       # interactive wizard
node packages/cli/dist/index.js portfolio get-all-balances --profile dev
```

Write-side smoke (clob.write, transfer.deposit, swap.execute, vaults.create_vault) is held back behind a manual gate — placing real orders or moving real tokens needs explicit user authorization.

---

## Adding a new tool

1. Pick the module file under `packages/core/src/tools/` (or create one and add it to `tools/index.ts`).
2. Append a `ToolSpec` to its `register*Tools()` array. Set `isWrite: true` for any state-changing operation — `--read-only` enforcement relies on this.
3. Pick the right rate-limit factory from `tools/common.ts` (`publicRateLimit` / `signedRateLimit` / `swapRateLimit` / `merklRateLimit`).
4. Add a unit test in `packages/core/test/` that mocks the client + contract.
5. Add a CLI dispatch entry in `packages/cli/src/commands/<module>.ts`.
6. If the tool is user-visible, update the module's `skills/dexalot-<module>/SKILL.md` command index + bump `metadata.version`.

The CLI's positional-to-tool-name convention is `dexalot <module> <action>` → `<module>_<action_with_underscores>`. Hyphens in the CLI become underscores in the MCP tool name.

---

## Reference docs in-repo

- [ARCHITECTURE.md](ARCHITECTURE.md) — layered architecture, mountpoints, SDK boundary, file map
- [README.md](README.md) — quickstart, module table, install
- [skills/README.md](skills/README.md) — skill catalog + conventions
- [skills/_shared/preflight.md](skills/_shared/preflight.md) — once-per-session agent setup

## Memory references (Claude's persistent store)

- `dexalot-environments` — network → URL + parentEnv mapping
- `dexalot-origin-cors` — the CORS allow-list gotcha and how the REST client handles it
- `feedback-use-devnet-for-smoke` — devnet is the default smoke target
- `dexalot-trade-kit-project` — overall project context

Update these if any of the above invariants change.
