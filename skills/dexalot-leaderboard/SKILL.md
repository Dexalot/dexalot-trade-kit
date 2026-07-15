---
name: dexalot-leaderboard
description: "Use this skill when the user asks for: the trader rewards leaderboard ranked by token/pair/dateperiod, available pair+dateperiod combinations or date ranges for leaderboard filters, timestamp of the last leaderboard recompute, a single trader's reward info or per-pair breakdown for a token+dateperiod, the connected wallet's reward info for a specific pair (signed lookup), subnet incentives info or breakdown claim info for the connected wallet, the backend signature authorizing a subnet-incentives or breakdown claim, or per-trader APY across a list of addresses. Public lookups work without a wallet; signed reward / signature endpoints require DEXALOT_PRIVATE_KEY. Do NOT use for portfolio balances (dexalot-portfolio), trading orders (dexalot-clob), aggregate exchange volume rankings (dexalot-analytics), or Merkl staking rewards (dexalot-rewards)."
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

# Dexalot Leaderboard CLI

Trader rewards leaderboard, per-trader reward info, and the claim-signature flow.

**Skill routing:**

- Reward rankings & claim signatures → `dexalot-leaderboard` (this skill)
- Aggregate exchange volume rankings → `dexalot-analytics`
- Staking rewards via Merkl → `dexalot-rewards`

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). Public lookups work without a wallet; the signed reward/signature endpoints require one.

## Command index

| Command                                                                                                        | Auth | Description                                   |
| -------------------------------------------------------------------------------------------------------------- | :--: | --------------------------------------------- |
| `dexalot leaderboard get-top-traders --token T --pair P --dateperiod week\|month\|all`                         |  —   | Ranked top traders for a pair+token           |
| `dexalot leaderboard get-table-parameters`                                                                     |  —   | Pair+dateperiod combinations available        |
| `dexalot leaderboard get-breakdown-parameters`                                                                 |  —   | Date ranges available for breakdowns          |
| `dexalot leaderboard get-last-updates-timestamp`                                                               |  —   | Last leaderboard recompute time               |
| `dexalot leaderboard get-single-trader-info --traderaddress A --token T --dateperiod P`                        |  —   | One trader's reward info                      |
| `dexalot leaderboard get-single-trader-breakdown --traderaddress A --token T --dateperiod P`                   |  —   | Per-pair breakdown of one trader's rewards    |
| `dexalot leaderboard get-trader-by-account --traderaddress A --token T --pair P --dateperiod P`                |  ✓   | Signed lookup for the connected wallet        |
| `dexalot leaderboard get-trader-subnet-incentives-info`                                                        |  ✓   | Subnet incentives earned + claimable          |
| `dexalot leaderboard get-trader-breakdown-claim-info`                                                          |  ✓   | Detailed breakdown for the claim wizard       |
| `dexalot leaderboard get-trader-subnet-incentives-signature`                                                   |  ✓   | Backend signature for subnet-incentives claim |
| `dexalot leaderboard get-trader-breakdown-claim-signature [--code C --redirect_uri U] [--claimedInTerms true]` |  ✓   | Backend signature for breakdown claim         |
| `dexalot leaderboard get-apys --traderaddresses 0xA,0xB --dateperiod week`                                     |  —   | Per-trader APY (POST)                         |

## Workflows

### Browse current week's top traders

```bash
dexalot leaderboard get-table-parameters     # discover valid combos
dexalot leaderboard get-top-traders --token USDC --pair ALOT/USDC --dateperiod week
```

### Inspect your own rewards before claiming

```bash
dexalot leaderboard get-trader-subnet-incentives-info --profile live
dexalot leaderboard get-trader-subnet-incentives-signature --profile live
```

The signature payload is then submitted on-chain to the claim contract (handled separately).

## Notes

- The 12-tool surface mirrors the frontend's leaderboard panel exactly.
- All signature endpoints are signed REST — no on-chain transaction is involved at this layer; the agent only obtains the authorization data.
