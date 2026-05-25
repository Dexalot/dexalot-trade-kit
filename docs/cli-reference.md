# CLI reference

```
dexalot <module> <action> [args] [--flag value]
dexalot setup --client <claude-desktop|cursor|windsurf|vscode|claude-code>
dexalot config <init|show|set|use|add-profile|list-profile>
dexalot discovery [list-tools|all|<module>]
dexalot --help [<module>]
dexalot --version
```

Module action names use **hyphens** (`get-pairs`). The MCP layer uses **underscores** for the same tool (`market_get_pairs`).

## Modules

| Module | Subcommands |
|---|---|
| `market` | get-pairs, get-tokens, get-orderbook (deferred), get-candles, get-oldest-candle-ts, get-environments, get-deployed-contracts, get-app-settings, get-blacklisted-addresses |
| `clob.read` | get-open-orders, get-orders-by-account, get-order, get-order-by-client-id (alias under `clob`) |
| `clob.write` | place-order, place-order-list, cancel-order, cancel-order-by-client-id, cancel-all-orders, cancel-list-orders, cancel-list-orders-by-client-id, replace-order, cancel-add-list (alias under `clob`) |
| `swap` | get-pairs, get-quote, get-firm-quote, execute |
| `portfolio` | get-balance, get-all-balances, get-chain-balance, get-chain-balances, get-all-chain-balances, get-token-usd-prices, get-token-usd-price-history, get-token-hourly-usd-price-history, get-balance-proof |
| `transfer` | deposit, withdraw, add-gas, remove-gas, portfolio, get-deposit-bridge-fee, get-token-details, get-combined-transfers |
| `analytics` | get-daily-volumes, get-top-tokens, get-top-pairs, get-stats, get-24h-stats, get-burned-fee-data, get-apys |
| `leaderboard` | get-top-traders, get-table-parameters, get-breakdown-parameters, get-last-updates-timestamp, get-single-trader-info, get-single-trader-breakdown, get-trader-by-account, get-trader-subnet-incentives-info, get-trader-breakdown-claim-info, get-trader-subnet-incentives-signature, get-trader-breakdown-claim-signature, get-apys |
| `vaults` | get-all-vaults, get-vaults-by-account, get-single-vault-by-account, get-vault-assets, get-vault-transfers, get-creation-config, create-vault |
| `trader-history` | get, register |
| `rewards` | get-subnet-incentives-info, get-breakdown-claim-info, get-subnet-incentives-signature, get-stake-merkl |
| `info` | get-high-priority-announcements, get-announcements, get-volume-rebate-tiers, get-account-volume-rebate |
| `pnl` | get |

Each module command has shorthand aliases — e.g. `dexalot market pairs` ≡ `dexalot market get-pairs`. Run `dexalot discovery <module>` to enumerate available actions.

## Global flags

| Flag | Effect |
|---|---|
| `--profile <name>` | Profile from `~/.dexalot/config.toml` |
| `--network <id>` | `mainnet` / `testnet` / `devnet` |
| `--testnet` / `--devnet` | Shorthand for `--network testnet` / `--network devnet` |
| `--live` | Force mainnet (refuses if profile says otherwise) |
| `--parent-env <name>` | Advanced: override SDK parentEnv |
| `--read-only` | Drop every `isWrite` tool from the registered set |
| `--json` | Print the full `ToolResult` instead of just data |
| `--env` | Wrap output as `{ env, profile, data }` |
| `--verbose` | Log request/response details to stderr |
| `--help` / `--version` | Self-explanatory |

## Examples

```bash
# Public market data
dexalot market get-pairs
dexalot market get-candles --pair ALOT/USDC --periodfrom 2026-05-24 --periodto 2026-05-25 --intervalnum 1 --intervalstr hours
dexalot analytics get-24h-stats
dexalot leaderboard get-top-traders --token USDC --pair ALOT/USDC --dateperiod week

# Signed reads
dexalot portfolio get-all-balances --profile live
dexalot clob get-open-orders --profile live
dexalot pnl get --dateFrom 2026-01-01 --dateTo 2026-05-25 --profile live

# Writes (require --modules including the write sub-module)
dexalot clob place-order --pair ALOT/USDC --side BUY --amount 100 --price 0.05 --profile live
dexalot transfer deposit --token USDC --amount 100 --sourceChain Avalanche --profile live
dexalot swap execute --quote "$(dexalot swap get-firm-quote --fromToken USDC --toToken AVAX --amount 100 --chainId 43114 --profile live --json | jq -c .data)" --profile live

# Devnet (rate-limit-safe)
dexalot market get-pairs --network devnet
dexalot analytics get-24h-stats --network devnet
```

## Discovery

```bash
dexalot discovery list-tools           # every tool, grouped by module
dexalot discovery list-tools --json    # same in machine-readable form
dexalot discovery market               # only the market module
```
