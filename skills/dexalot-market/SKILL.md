---
name: dexalot-market
description: 'Use this skill when the user asks for: list of Dexalot trading pairs, available tokens or token metadata across Avalanche/Ethereum/Arbitrum/Dexalot L1, the live orderbook (bids/asks) for a pair, historical candles (OHLCV) for any pair, earliest candle timestamp, Dexalot environments (mainnet/testnet/devnet chain registries), deployed contract addresses (Portfolio/TradePairs/MainnetRFQ) and their ABIs, global app settings (feature flags, fee tiers, kill-switches), or the SDN/blacklist of restricted addresses on Dexalot. All commands are read-only and require NO wallet, NO private key, and NO Dexalot account. Do NOT use for placing/cancelling orders (dexalot-clob), account balances (dexalot-portfolio), RFQ swaps (dexalot-swap), deposits/withdrawals (dexalot-transfer), analytics rankings (dexalot-analytics), or vault info (dexalot-vaults).'
license: MIT
metadata:
  author: dexalot-trade-kit
  version: '0.2.0'
  homepage: 'https://app.dexalot.com'
  agent:
    requires:
      bins: ['dexalot']
    install:
      - id: npm
        kind: node
        package: '@dexalot/trade-cli@0.1.1'
        bins: ['dexalot']
        label: 'Install dexalot CLI (npm)'
---

# Dexalot Market Data CLI

> **Compliance notice**: This skill provides raw market data only. No strategy, recommendation, or optimization logic is embedded. All outputs are objective payloads; interpretation and trading decisions remain solely with the user.

Public market data for the Dexalot DEX: trading pairs, token registry, live orderbook, historical candles, environments, deployed contracts, app settings, and the address blacklist. All commands are **read-only** and require **no wallet credentials**.

> **Routing:** `get-pairs`, `get-tokens`, `get-environments`, and `get-orderbook` are served by the `@dexalot/dexalot-sdk` (on-chain / canonical reads); `get-deployed-contracts`, `get-app-settings`, `get-candles`, `get-oldest-candle-ts`, and `get-blacklisted-addresses` hit the public REST backend. Both are transparent — every command stays read-only and wallet-free.

**Skill routing:**

- Market data and discovery → `dexalot-market` (this skill)
- Account balances → `dexalot-portfolio`
- Place / cancel orders → `dexalot-clob`
- RFQ swaps → `dexalot-swap`
- Bridges and gas → `dexalot-transfer`

## Preflight

Before running any command, follow [`../_shared/preflight.md`](../_shared/preflight.md). Use `metadata.version` from this file's frontmatter as the reference for the drift check.

## Install

```bash
npm install -g @dexalot/trade-cli
dexalot --version           # verify
dexalot market get-pairs --network testnet | head   # smoke test
```

Market data commands return the same payload regardless of whether a wallet is configured. The `--network` flag selects the environment:

| `--network`         | API host               | Notes                                                    |
| ------------------- | ---------------------- | -------------------------------------------------------- |
| `mainnet` (default) | `api.dexalot.com`      | Production                                               |
| `testnet`           | `api.dexalot-test.com` | Fuji L1                                                  |
| `devnet`            | `api.dexalot-dev.com`  | Internal — requires `api_base_url` in profile or env var |

Add `--json` for the full `ToolResult` (endpoint + timestamp + data). Add `--env` to wrap the output as `{ env, profile, data }`. No confirmation needed before running any market command.

---

## Command Index

| #   | Command                                                                                           | Description                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `dexalot market get-pairs`                                                                        | List every CLOB pair with min/max trade amounts, decimals, fee bps, status.                                      |
| 2   | `dexalot market get-tokens`                                                                       | List every recognized token across all connected chains (Dexalot L1 symbol, addresses, decimals, auction state). |
| 3   | `dexalot market get-environments`                                                                 | List the connected chain environments for the active network.                                                    |
| 4   | `dexalot market get-orderbook --pair P`                                                           | Live orderbook snapshot (bids/asks with price + quantity) for a pair.                                            |
| 5   | `dexalot market get-deployed-contracts [--env name] [--contracttype All] [--returnabi false]`     | Fetch deployed contract addresses + ABIs (Portfolio, TradePairs, MainnetRFQ).                                    |
| 6   | `dexalot market get-app-settings`                                                                 | Fetch global app settings (feature flags, fee tiers, kill-switches).                                             |
| 7   | `dexalot market get-candles --pair P --periodfrom F --periodto T --intervalnum N --intervalstr U` | OHLCV history; intervalstr ∈ {minutes, hours, day}.                                                              |
| 8   | `dexalot market get-oldest-candle-ts --pair P --interval I`                                       | Earliest candle timestamp for a pair at a given interval.                                                        |
| 9   | `dexalot market get-blacklisted-addresses`                                                        | SDN/blacklist of addresses Dexalot's backend refuses.                                                            |

Action aliases: `pairs`, `tokens`, `environments`, `orderbook`, `deployment`, `settings`, `candles`, `oldest-candle-ts`, `blacklist`.

---

## Workflows

### What pairs can I trade?

```bash
dexalot market get-pairs --network mainnet
```

Returns an array of pair objects. Important fields:

- `pair` — the canonical symbol (e.g. `ALOT/USDC`).
- `mintrade_amnt` / `maxtrade_amnt` — order size bounds (in quote currency).
- `status` — `deployed` means tradable.
- `taker_rate_bps` / `maker_rate_bps` — fee schedule in basis points.

### Get last 24h of 1-hour candles for ALOT/USDC

```bash
dexalot market get-candles \
  --pair ALOT/USDC \
  --periodfrom 2026-05-24 \
  --periodto 2026-05-25 \
  --intervalnum 1 \
  --intervalstr hours \
  --network mainnet
```

Each candle returns string-typed `open / high / low / close / volume` and a `date` field. Strings are deliberate — the API does not lose decimal precision.

### Bound a historical backfill

Before requesting deep history, ask the backend how far it can go:

```bash
dexalot market get-oldest-candle-ts --pair ALOT/USDC --interval 1h
```

Use the returned `ts` as the lower bound of subsequent `get-candles` calls.

### Verify deployment for a chain

```bash
dexalot market get-deployed-contracts --env fuji-multi-avax --contracttype Portfolio
```

Returns the Portfolio contract address and ABI for the requested environment. Useful when wiring an external integration that must call the same contracts as the SDK.

### Discover connected chains

```bash
dexalot market get-environments
```

Returns one entry per connected chain (chain id, name, native asset, env kind). Pair with `get-tokens` to map a symbol back to its on-chain address per network.

---

## Output

By default the CLI prints the `data` portion of the tool result as pretty JSON. Add `--json` for the full `ToolResult`:

```json
{
  "endpoint": "GET pairs",
  "requestTime": "2026-05-25T15:02:34.221Z",
  "data": [{ "pair": "ALOT/USDC", ... }]
}
```

Add `--env` to wrap the output for cross-network scripts:

```json
{
  "env": "testnet",
  "profile": "default",
  "data": [{ "pair": "ALOT/USDC", ... }]
}
```

---

## Errors

A request that fails with `Not allowed by CORS` indicates the active network's host does not recognise the request's Origin header. The CLI sets this automatically per `--network`; this error should not be reachable with the official CLI. If it appears, file a bug.

A request that returns an empty array (`[]`) means the backend has no data for the parameters provided — typically a misspelled pair (e.g. `ALOT-USDC` instead of `ALOT/USDC`) or a time range with no candles. Verify the pair name with `dexalot market get-pairs`.
