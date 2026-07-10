---
name: dexalot-portfolio
description: 'Use this skill when the user asks for: Dexalot L1 balance for a token (total/available/locked), all Dexalot L1 balances for a wallet, on-chain wallet balance on Avalanche/Ethereum/Arbitrum/Dexalot L1, all token balances on a connected chain, every balance across every connected chain, current USD prices for Dexalot-listed tokens, daily or hourly USD price history, or a signed Merkle balance proof. Most commands require a wallet (DEXALOT_PRIVATE_KEY or profile private_key); USD price queries do not. Do NOT use for placing or cancelling orders (dexalot-clob), depositing/withdrawing between chains (dexalot-transfer), RFQ swap quotes (dexalot-swap), trading-volume rankings (dexalot-analytics), or PnL across a date range (dexalot-pnl).'
license: MIT
metadata:
  author: dexalot-trade-kit
  version: '0.1.2'
  homepage: 'https://app.dexalot.com'
  agent:
    requires:
      bins: ['dexalot']
    install:
      - id: npm
        kind: node
        package: '@dexalot/trade-cli@0.1.2'
        bins: ['dexalot']
        label: 'Install dexalot CLI (npm)'
---

# Dexalot Portfolio CLI

Wallet balance queries across the Dexalot L1 and every connected chain, plus USD pricing and balance proofs.

**Skill routing:**

- Balances & pricing → `dexalot-portfolio` (this skill)
- Deposits / withdrawals → `dexalot-transfer`
- Place / cancel orders → `dexalot-clob`
- Public market data → `dexalot-market`
- PnL over a date range → `dexalot-pnl`

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). Confirm a profile with `private_key` exists before running balance commands. USD-price commands work without a wallet.

## Command Index

| Command                                                                 | Auth | Description                                                        |
| ----------------------------------------------------------------------- | :--: | ------------------------------------------------------------------ |
| `dexalot portfolio get-balance --token T [--address A]`                 |  ✓   | Dexalot L1 balance for one token (total / available / locked)      |
| `dexalot portfolio get-all-balances [--address A]`                      |  ✓   | Every Dexalot L1 balance for the wallet                            |
| `dexalot portfolio get-chain-balance --chain C --token T [--address A]` |  ✓   | One token on one connected chain                                   |
| `dexalot portfolio get-chain-balances --chain C [--address A]`          |  ✓   | Every token on one connected chain                                 |
| `dexalot portfolio get-all-chain-balances [--address A]`                |  ✓   | Every token across every connected chain (slow — cache the result) |
| `dexalot portfolio get-token-usd-prices`                                |  —   | Current USD prices for every Dexalot-listed token                  |
| `dexalot portfolio get-token-usd-price-history --token T`               |  —   | Daily USD price history for one token                              |
| `dexalot portfolio get-token-hourly-usd-price-history --token T`        |  —   | Hourly USD price history for one token (last 7 days)               |
| `dexalot portfolio get-balance-proof --symbol T [--traderaddress A]`    |  ✓   | Signed Merkle proof of Dexalot L1 balance                          |

Action aliases: `balances`, `usd-prices`, `usd-price-history`, `hourly-usd-price-history`, `balance-proof`.

## Chain naming per network

The `--chain` parameter for `get-chain-balance` / `get-chain-balances` accepts the Dexalot-internal chain name, which **differs between mainnet and testnet**. Use `market get-environments` to list the active network's chain names, or refer to this table:

| Logical chain     | mainnet      | testnet / devnet   |
| ----------------- | ------------ | ------------------ |
| Avalanche C-Chain | `Avalanche`  | `Fuji`             |
| Ethereum L1       | `Ethereum`   | `Ethereum Sepolia` |
| Arbitrum          | `Arbitrum`   | `Arbitrum Sepolia` |
| Base              | `Base`       | `Base Sepolia`     |
| BSC               | `BSC`        | `BSC Testnet`      |
| Dexalot L1        | `Dexalot L1` | `Dexalot L1`       |

If you pass an unknown chain name the error message lists the connected chains for the active network.

## Workflows

### Snapshot a wallet's Dexalot L1 holdings

```bash
dexalot portfolio get-all-balances --profile live
```

Returns `{ ALOT: {total, available, locked}, USDC: ..., ... }`. `available` is what can be used for new orders; `locked` is reserved by open orders.

### Mark portfolio to USD

```bash
dexalot portfolio get-token-usd-prices > prices.json
dexalot portfolio get-all-balances --profile live > balances.json
```

Multiply each balance's `total` by the corresponding price field to value the portfolio.

### Cross-chain balance audit before bridging

```bash
dexalot portfolio get-chain-balance --chain Avalanche --token USDC --profile live
```

If the source chain doesn't have enough, switch chain or top up before calling `dexalot transfer deposit`.

### Get a signed balance proof for compliance

```bash
dexalot portfolio get-balance-proof --symbol USDC --profile live
```

Returns a Merkle proof + root verifiable off-chain. Used by Dexalot's reserve attestation flow.

## Notes

- Balance reads route through the Dexalot SDK's contract layer. First call triggers SDK initialization (fetching environments / tokens / pairs / deployments) — expect a few-hundred-ms one-time cold start.
- "Dexalot L1" is the chain itself; only `ALOT` (native gas) is queryable via `get-chain-balance`. For everything else use `get-balance` or `get-all-balances`.
- USD price data has a 30-second cache on the backend; expect minor staleness.
