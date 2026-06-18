# `rewards` module

Subnet incentives + external Merkl staking rewards.

| Tool | CLI | Route |
|---|---|---|
| `rewards_get_subnet_incentives_info` | `dexalot rewards get-subnet-incentives-info` | SIGNED_API `GET reward/earned?type=1` |
| `rewards_get_breakdown_claim_info` | `dexalot rewards get-breakdown-claim-info` | SIGNED_API `GET reward/earned` |
| `rewards_get_subnet_incentives_signature` | `dexalot rewards get-subnet-incentives-signature` | SIGNED_API `GET reward/signature?type=1` |
| `rewards_get_stake_merkl` | `dexalot rewards get-stake-merkl --address 0x... --chainId N [--isTestnet]` | MERKL_API `GET users/<addr>/rewards` |

The subnet-incentives endpoints overlap with `leaderboard` — use this skill when the agent is on a claim flow.
