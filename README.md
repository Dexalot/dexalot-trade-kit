# Dexalot Trade Kit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

AI-powered trading toolkit for the [Dexalot](https://app.dexalot.com) DEX. Two standalone packages share a single tool registry:

| Package | Description |
|---|---|
| `@dexalot/trade-mcp` | MCP server for Claude / Cursor / any MCP-compatible AI client |
| `@dexalot/trade-cli` | Terminal CLI for operating Dexalot directly |

## What is this?

Dexalot Trade Kit connects AI assistants directly to your Dexalot wallet via the [Model Context Protocol](https://modelcontextprotocol.io). Instead of switching between your AI and the Dexalot interface, you describe what you want — the AI calls the right tools and executes it.

It runs as a **local process** with your wallet private key stored only on your machine. No cloud services, no data leaving your device.

## Features

| Feature | Description |
|---------|-------------|
| **80 tools across 13 modules** | Full Dexalot surface: CLOB trading, RFQ swaps, cross-chain transfers, portfolio, analytics, leaderboard, OmniVaults, rewards, PnL |
| **Three networks** | `mainnet`, `testnet`, `devnet` — switch with one flag |
| **Safety controls** | `--read-only` flag drops every on-chain or backend-mutating tool; per-module filtering; built-in rate limiter |
| **Capability snapshot in every response** | MCP host always knows which modules are active, whether writes are enabled, and which network |
| **Zero infrastructure** | Local stdio process, no server or database required |
| **MCP standard** | Works with Claude Desktop, Cursor, Windsurf, VS Code, and any MCP-compatible client |
| **Agent skills included** | 12 pre-built skill files for AI agent frameworks |
| **Open source** | MIT license, private key never leaves your machine |

## Modules

| Module | Tools | Description | Auth |
|---|:-:|---|:-:|
| `market` | 9 | Pairs, tokens, orderbook, candles, environments, deployed contracts, app settings, blacklist | — |
| `clob.read` | 4 | Open orders, order history, order detail, lookup by client id | ✓ |
| `clob.write` | 9 | Place / cancel / replace / batch orders on the TradePairs contract | ✓ |
| `swap` | 4 | RFQ swap pairs, soft / firm quotes, on-chain execute | mixed |
| `portfolio` | 9 | Dexalot L1 + multi-chain balances, USD prices, balance proof | mixed |
| `transfer` | 8 | Cross-chain deposits / withdrawals, gas, P2P, bridge fees, history | ✓ |
| `analytics` | 7 | Daily volumes, top tokens / pairs, stats, burned ALOT, APYs | — |
| `leaderboard` | 12 | Trader rewards leaderboard, single-trader info / breakdown, claim signatures | mixed |
| `vaults` | 7 | OmniVault info, assets, transfers, creation config, signed create request | mixed |
| `trader_history` | 2 | Async export request management | ✓ |
| `rewards` | 4 | Subnet incentives, breakdown claim info, claim signatures, Merkl stake rewards | mixed |
| `pnl` | 1 | Realized + unrealized PnL over a date range | ✓ |
| `info` | 4 | Announcements (high-priority + general), volume rebate tiers + account rebate | mixed |

`system` always provides one meta-tool: `system_get_capabilities` (attached to every response).

## Quick start

**Prerequisites:** Node.js ≥ 18.

One command registers the MCP server with your AI client — no global install needed:

```bash
npx -y @dexalot/trade-mcp setup --client claude-desktop   # or: claude-code | cursor | vscode | windsurf
```

It starts **`--read-only` on mainnet** — no wallet needed for market data, analytics, and balance reads.

### Enable trading (add a wallet) — one command

```bash
npx -y @dexalot/trade-cli config init
```

The wizard asks for a profile name, network, and your wallet's private key (input hidden), then offers to **encrypt it in the Dexalot secrets vault** (`~/.dexalot/secrets_vault.json`, Fernet-encrypted via the SDK). It prints a one-time **vault key** — save it; it decrypts your key and is not stored anywhere. Finally a **checkbox registers MCP clients for you**, wiring the profile in (and the vault key) so you don't hand-edit any config. Pick one or several:

```
Register the MCP server with which clients?
  (↑/↓ move · space toggle · enter confirm)
 › ◉ Claude Desktop
   ◯ Cursor
   ◯ Windsurf
   ◯ VS Code
   ◯ Claude Code CLI
Enable trading (write tools: orders, deposits, swaps)? (y/N): N
✓ Configured Claude Desktop
```

The key stays on your machine (encrypted in the vault) and is only used to sign locally. The client is registered **`--read-only` by default** — answer `y` to "Enable trading" to expose write tools. Restart your AI client, then ask *"What are my Dexalot capabilities?"* — it should report `hasWallet: true`.

> Prefer to wire it up yourself? Skip the checkbox and run `dexalot setup --client <name> --profile <name>` later; set `DEXALOT_VAULT_KEY` (the printed vault key) in the client's env so the server can decrypt at launch.

> **Claude Code** can install the 12 skills + MCP server together in one step instead:
>
> ```text
> /plugin marketplace add dexalot/dexalot-trade-kit
> /plugin install dexalot-trade@dexalot-trade-kit
> ```

Prefer global binaries (`dexalot-trade-mcp`, `dexalot`)? `npm i -g @dexalot/trade-mcp @dexalot/trade-cli`.

## dexalot-trade-mcp

```bash
dexalot-trade-mcp                                            # defaults: market, clob.read, portfolio, analytics
dexalot-trade-mcp --modules market --read-only               # no-wallet market data
dexalot-trade-mcp --profile live --modules all               # everything
dexalot-trade-mcp --network testnet --profile test           # testnet
dexalot-trade-mcp --network devnet --read-only               # internal devnet
dexalot-trade-mcp --read-only --modules all                  # all reads, zero writes
```

## dexalot CLI

```bash
dexalot market get-pairs                                       # any network
dexalot portfolio get-all-balances --profile live              # signed
dexalot analytics get-24h-stats                                # public
dexalot clob place-order --pair ALOT/USDC --side BUY --amount 100 --price 0.05 --profile live
dexalot clob cancel-all-orders --profile live
dexalot swap get-firm-quote --fromToken USDC --toToken AVAX --amount 100 --chainId 43114 --profile live
dexalot transfer deposit --token USDC --amount 100 --sourceChain Avalanche --profile live
dexalot pnl get --dateFrom 2026-01-01 --dateTo 2026-05-25 --profile live
```

**Output flags:**
- `--json` — full `ToolResult` (endpoint + timestamp + data) instead of just `data`
- `--env` — wrap as `{ env, profile, data }` for cross-network script pipes
- `--verbose` — request / response log to stderr

CLI subcommand names use **hyphens** (`dexalot market get-pairs`); MCP tool names use **underscores** (`market_get_pairs`). Both share the same registry.

## Configuration

Profile file: `~/.dexalot/config.toml`

```toml
default_profile = "live"

[profiles.live]
private_key = "0x..."
network = "mainnet"

[profiles.test]
private_key = "0x..."
network = "testnet"

[profiles.dev]
network = "devnet"
# Optional overrides:
# api_base_url = "https://api.dexalot-dev.com/api"
# parent_env = "fuji-multi-avax"
# timeout_ms = 15000
# rpc.43113 = ["https://rpc.example/avax-fuji"]
```

**Precedence** (highest → lowest):
1. CLI flag (`--network`, `--profile`, …)
2. Env var (`DEXALOT_PRIVATE_KEY`, `DEXALOT_NETWORK`, `DEXALOT_API_BASE_URL`, `DEXALOT_TIMEOUT_MS`, `DEXALOT_RPC_<chainId>`)
3. TOML profile field
4. Built-in default (`mainnet`, `15000` ms)

## Skills

Drop-in skill files for AI agent frameworks (Claude Code, Codex CLI, anything else MCP-compatible). Each `skills/<name>/SKILL.md` carries a ≤900-char `description` and a command index.

See [skills/README.md](skills/README.md) for the catalog and conventions.

## Build from source

```bash
git clone <repo>
cd dexalot-trade-kit
pnpm install
pnpm build
pnpm typecheck
pnpm test:unit
```

```
packages/
├── core/    # @dexalot/trade-core — shared client, tool registry, config
├── mcp/     # @dexalot/trade-mcp  — MCP server binary
└── cli/     # @dexalot/trade-cli  — CLI binary
```

Local QA scripts (no funds, nothing written to your real config — they use an ephemeral wallet and a temp HOME):

```bash
./scripts/test-reads.sh             # public + signed reads across modules
./scripts/test-mcp-stdio.sh         # JSON-RPC handshake + sample tool calls
./scripts/test-mcp-registration.sh  # claude mcp add → get → list → remove lifecycle
./scripts/test-config-init.sh       # config init wizard + client auto-register (PTY)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the layered architecture, mountpoint mapping, and SDK boundary rules.

## Documentation

| Document | Description |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, layers, mountpoints, SDK boundary |
| [CLAUDE.md](CLAUDE.md) | Codebase orientation for Claude sessions in this repo |
| [skills/README.md](skills/README.md) | Agent skills catalog |
| [docs/configuration.md](docs/configuration.md) | All env vars, TOML fields, startup scenarios |
| [docs/cli-reference.md](docs/cli-reference.md) | Full CLI reference |
| [docs/modules/](docs/modules/) | Per-module endpoint and tool docs |

## Reporting issues

If a tool call or CLI command fails, open an issue and include the full error payload. MCP errors are structured JSON; CLI errors print stderr with the `type`, `message`, `suggestion`, and `traceId` fields.
