---
name: dexalot-rewards
description: 'Use this skill when the user asks for: subnet incentives reward info or per-period breakdown claim info for the connected wallet (earned + claimable in the active epoch), the backend signature authorizing an on-chain subnet-incentives claim, or staking rewards available on Merkl (external api.merkl.xyz, no Dexalot auth) for a specific wallet address + chain id. Subnet incentives endpoints require DEXALOT_PRIVATE_KEY; Merkl rewards do not (just pass the address). Do NOT use for trader rewards leaderboard or per-pair reward breakdowns (dexalot-leaderboard), portfolio balances (dexalot-portfolio), or volume rebate tiers (dexalot-info).'
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

# Dexalot Rewards CLI

Subnet incentives + Merkl staking rewards for the connected wallet.

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). Subnet incentives endpoints require a wallet; Merkl works with any address.

## Command index

| Command                                                                         | Auth | Description                                   |
| ------------------------------------------------------------------------------- | :--: | --------------------------------------------- |
| `dexalot rewards get-subnet-incentives-info`                                    |  ✓   | Subnet incentives earned + claimable (type=1) |
| `dexalot rewards get-breakdown-claim-info`                                      |  ✓   | Per-period breakdown (no type filter)         |
| `dexalot rewards get-subnet-incentives-signature`                               |  ✓   | Backend signature authorizing on-chain claim  |
| `dexalot rewards get-stake-merkl --address 0x... --chainId 43114 [--isTestnet]` |  —   | Merkl stake rewards (external)                |

## Workflow

### Check + claim subnet incentives

```bash
# 1. How much is earned this epoch?
dexalot rewards get-subnet-incentives-info --profile live

# 2. Fetch the signature for the claim transaction
dexalot rewards get-subnet-incentives-signature --profile live
# Submit the returned signature to the on-chain claim contract (off this skill)
```

### Look up Merkl rewards

```bash
dexalot rewards get-stake-merkl --address 0xWALLET --chainId 43114
```

Merkl is Angle Protocol's reward aggregator — pass `isTestnet=true` to hit Merkl's test endpoint.

## Notes

- The rewards module overlaps with `dexalot-leaderboard` — leaderboard exposes the same subnet-incentives endpoints under a different conceptual grouping. Agents working on a claim flow should prefer this skill; agents browsing the leaderboard should prefer that one.
- `get-stake-merkl` is the only tool that hits an external host (`api.merkl.xyz`). Rate-limited to 1 req/s.
