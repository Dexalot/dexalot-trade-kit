# Configuration

All Dexalot Trade Kit binaries read the same config:

| Source | Precedence (highest first) |
|---|---|
| CLI flag (`--network`, `--profile`, `--testnet`, `--devnet`, `--live`, `--read-only`, …) | 1 |
| Env var (`DEXALOT_PRIVATE_KEY`, `DEXALOT_NETWORK`, `DEXALOT_API_BASE_URL`, `DEXALOT_PARENT_ENV`, `DEXALOT_TIMEOUT_MS`, `DEXALOT_RPC_<chainId>`, `DEXALOT_TIMESTAMPED_AUTH`, `DEXALOT_UPDATE_CHECK`, `DEXALOT_LOG_RETENTION_DAYS`) | 2 |
| Profile in `~/.dexalot/config.toml` (selected by `--profile name` or `default_profile`) | 3 |
| Built-in default (mainnet, 15 s timeout) | 4 |

## TOML profile shape

```toml
default_profile = "live"

[profiles.live]
private_key = "0x..."          # 0x-prefixed 32-byte hex
network     = "mainnet"        # mainnet | testnet | devnet

# Optional advanced overrides:
# api_base_url     = "https://api.dexalot.com/api"
# parent_env       = "production-multi-avax"
# timeout_ms       = 15000
# timestamped_auth = false
# proxy_url        = "http://127.0.0.1:7890"

# Per-chain RPC failover lists (keys are chain ids as strings):
[profiles.live.rpc]
43114 = ["https://api.avax.network/ext/bc/C/rpc"]
1     = ["https://eth.llamarpc.com"]
```

See [config.toml.example](../config.toml.example) for the canonical template. Run `dexalot config init` for an interactive wizard.

## Networks

| `--network` | API base | SDK `parentEnv` (default) | Notes |
|---|---|---|---|
| `mainnet` | `https://api.dexalot.com/api` | `production-multi-avax` | Production |
| `testnet` | `https://api.dexalot-test.com/api` | `fuji-multi-avax` | Fuji subnet |
| `devnet` | `https://api.dexalot-dev.com/api` | `fuji-multi-avax` | Internal — use for smoke tests |

`--testnet` and `--devnet` are shorthands for `--network testnet|devnet`. `--live` forces mainnet (refuses to start if the profile resolves to testnet/devnet).

## Startup scenarios

### Read-only market data (no wallet)

```bash
dexalot-trade-mcp --read-only --modules market,analytics,info
```

Starts cleanly with no private key configured. Public modules are `enabled`; signed modules report `requires_auth` in `system_get_capabilities`.

### Read-only with wallet (monitoring)

```bash
dexalot-trade-mcp --read-only --modules all --profile live
```

Every read tool is exposed; every write tool (clob.write, transfer writes, swap.execute, vaults.create_vault) is dropped from the registered set.

### Full trading

```bash
dexalot-trade-mcp --modules all --profile live
```

Everything. The MCP server's `WRITE_ACTION_PATTERN` safeguard still guards against the agent auto-executing write remediations on error messages.

### Testnet trading

```bash
dexalot-trade-mcp --modules all --profile test
# or
DEXALOT_PRIVATE_KEY="0x..." dexalot-trade-mcp --modules all --testnet
```

### Devnet smoke

```bash
dexalot-trade-mcp --network devnet --read-only --modules all
```

Useful in CI — no wallet required, every public endpoint reachable.

## MCP host registration

```bash
dexalot-trade-mcp setup --client claude-desktop
dexalot-trade-mcp setup --client cursor
dexalot-trade-mcp setup --client windsurf
dexalot-trade-mcp setup --client vscode      # writes .mcp.json in cwd
dexalot-trade-mcp setup --client claude-code # auto-registers via the claude CLI
```

Optional flags forwarded to the MCP entry: `--profile <name>`, `--modules <list>`.

## Profile management

```bash
dexalot config init                          # interactive wizard
dexalot config list-profile                  # list profiles (* marks default)
dexalot config show --profile live           # show one profile (masked key)
dexalot config use test                      # set default_profile
dexalot config add-profile staging           # wizard for a new profile
dexalot config set live network mainnet      # update one field
```

The config file lives at `~/.dexalot/config.toml` on every platform.

## Update notifier

The CLI/MCP poll npm once every 24 h (cached at `~/.dexalot/update-check.json`). Disable with `DEXALOT_UPDATE_CHECK=false`.
