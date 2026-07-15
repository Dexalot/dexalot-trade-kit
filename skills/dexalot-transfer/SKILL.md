---
name: dexalot-transfer
description: "Use this skill when the user asks to: deposit tokens from a connected chain (Avalanche/Ethereum/Arbitrum) into the Dexalot L1, withdraw tokens from the Dexalot L1 back to a source chain, top up or remove native ALOT gas balance for paying Dexalot L1 transaction fees, transfer Dexalot L1 portfolio balance to another wallet (P2P), estimate the bridge fee for a deposit, look up a token's per-chain contract address and decimals, or list paginated cross-chain transfer history (deposits/withdrawals/gas/P2P). All writes require a wallet (DEXALOT_PRIVATE_KEY or profile private_key). Do NOT use for placing/cancelling orders (dexalot-clob), RFQ swap settlement (dexalot-swap), balance queries (dexalot-portfolio), or USD pricing (dexalot-portfolio's USD-price tools)."
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

# Dexalot Transfer CLI

Cross-chain deposits and withdrawals between the Dexalot L1 and connected source chains, plus gas management and P2P portfolio transfers.

**Skill routing:**

- Bridging + gas + P2P → `dexalot-transfer` (this skill)
- Balance queries → `dexalot-portfolio`
- CLOB trading → `dexalot-clob`
- RFQ swaps (on a single chain, no bridge) → `dexalot-swap`

## Chain naming per network

`sourceChain` / `destinationChain` accept the Dexalot-internal chain name. **Names differ between mainnet and testnet** — run `dexalot market get-environments` to list the active set. Common mappings:

| Logical chain     | mainnet      | testnet / devnet   |
| ----------------- | ------------ | ------------------ |
| Avalanche C-Chain | `Avalanche`  | `Fuji`             |
| Ethereum L1       | `Ethereum`   | `Ethereum Sepolia` |
| Arbitrum          | `Arbitrum`   | `Arbitrum Sepolia` |
| Base              | `Base`       | `Base Sepolia`     |
| BSC               | `BSC`        | `BSC Testnet`      |
| Dexalot L1        | `Dexalot L1` | `Dexalot L1`       |

If you pass an unknown chain name the error lists the connected set.

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). All writes need a wallet; reads (`get-deposit-bridge-fee`, `get-token-details`, `get-combined-transfers`) also need a wallet because the SDK initializer expects one.

## Command Index

| Command                                                                                                                       | Auth | Description                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------- | :--: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dexalot transfer deposit --token T --amount A --sourceChain C [--useLayerZero] [--waitForReceipt]`                           |  ✓   | Bridge token from source chain to Dexalot L1                                                                                                                                      |
| `dexalot transfer withdraw --token T --amount A --destinationChain C [--useLayerZero]`                                        |  ✓   | Bridge token from Dexalot L1 to destination chain                                                                                                                                 |
| `dexalot transfer add-gas --amount N`                                                                                         |  ✓   | Withdraw native ALOT from portfolio to wallet (gas)                                                                                                                               |
| `dexalot transfer remove-gas --amount N`                                                                                      |  ✓   | Deposit native ALOT from wallet to portfolio                                                                                                                                      |
| `dexalot transfer portfolio --token T --amount A --toAddress 0x...`                                                           |  ✓   | P2P transfer on Dexalot L1                                                                                                                                                        |
| `dexalot transfer get-deposit-bridge-fee --token T --amount A --sourceChain C`                                                |  ✓   | Estimate bridge cost in native asset                                                                                                                                              |
| `dexalot transfer get-token-details --token T`                                                                                |  —   | Per-chain contract addresses + decimals                                                                                                                                           |
| `dexalot transfer get-combined-transfers [--symbol T] [--fromTs UNIX_SECONDS] [--toTs UNIX_SECONDS] [--limit N] [--offset N]` |  ✓   | History (canonical Transfer rows; `--fromTs`/`--toTs` are unix timestamps in seconds; legacy `--type`/`--status` flags are accepted but ignored — the backend never honored them) |

## Typical workflows

### Bridge USDC from Avalanche to the Dexalot L1

```bash
# 1. Confirm balance on source chain
dexalot portfolio get-chain-balance --chain Avalanche --token USDC --profile live

# 2. Estimate the bridge fee
dexalot transfer get-deposit-bridge-fee --token USDC --amount 100 --sourceChain Avalanche --profile live

# 3. Submit the deposit
dexalot transfer deposit --token USDC --amount 100 --sourceChain Avalanche --profile live

# 4. Confirm the Dexalot L1 balance arrived
dexalot portfolio get-balance --token USDC --profile live
```

### Withdraw USDC back to Avalanche

```bash
dexalot transfer withdraw --token USDC --amount 50 --destinationChain Avalanche --profile live
```

Withdrawal finality on the destination chain is asynchronous; track via `dexalot transfer get-combined-transfers` and filter the returned rows by `actionType: "WITHDRAW"` client-side (the backend doesn't expose a server-side type filter).

### Top up gas balance

If Dexalot L1 transactions are failing with "out of gas", the wallet's native ALOT is low. Transfer some from portfolio:

```bash
dexalot transfer add-gas --amount 1 --profile live
```

### P2P send to another wallet

```bash
dexalot transfer portfolio --token USDC --amount 25 --toAddress 0xRECIPIENT --profile live
```

### Cross-chain history audit

```bash
dexalot transfer get-combined-transfers --limit 50 --profile live
```

Returns the most recent 50 cross-chain or P2P events involving the wallet.

## Safety

Bridges and on-chain transfers are **irreversible**. The MCP server's `WRITE_ACTION_PATTERN` safeguard appends a warning when any error message hints at write remediations — the agent will not auto-execute those.

Under `--read-only`, every write tool is dropped from the registered set; only the three reads (`get-deposit-bridge-fee`, `get-token-details`, `get-combined-transfers`) remain.

Always verify source-chain balance and bridge fee before issuing a deposit. For new tokens, run `transfer get-token-details` first to confirm the per-chain contract address matches expectations.
