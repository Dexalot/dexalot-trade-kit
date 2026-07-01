# @dexalot/trade-cli

Command line tool for the Dexalot DEX. Same tool registry as the MCP server —
just a different transport.

### Install

```bash
npm install -g @dexalot/trade-cli
```

### Configure credentials

Run the interactive wizard:

```bash
dexalot init
```

…or hand-edit `~/.dexalot/config.toml`:

```toml
default_profile = "live"

[profiles.live]
private_key = "0x..."
network     = "mainnet"

[profiles.test]
private_key = "0x..."
network     = "testnet"
```

### Quick usage

```bash
dexalot market get-pairs                              # public reads
dexalot market get-candles --pair ALOT/USDC --periodfrom 2026-05-24 --periodto 2026-05-25 --intervalnum 1 --intervalstr hours
dexalot analytics get-24h-stats
dexalot portfolio get-all-balances --profile live     # signed
dexalot clob get-open-orders --profile live
dexalot pnl get --dateFrom 2026-01-01 --dateTo 2026-05-25 --profile live
```

### Trading

```bash
dexalot clob place-order --pair ALOT/USDC --side BUY --amount 100 --price 0.05 --profile live
dexalot clob cancel-all-orders --profile live
dexalot swap get-firm-quote --fromToken USDC --toToken AVAX --amount 100 --chainId 43114 --profile live
dexalot transfer deposit --token USDC --amount 100 --sourceChain Avalanche --profile live
```

### Help

```bash
dexalot --help
dexalot --version
dexalot discovery list-tools           # every registered tool
dexalot discovery list-tools --json    # machine-readable
```

### Output flags

| Flag | Effect |
|---|---|
| `--json` | Full `ToolResult` instead of just `data` |
| `--env`  | Wrap as `{ env, profile, data }` |
| `--verbose` | Log request/response details to stderr |

For more details, see the [repository README](../../README.md).
