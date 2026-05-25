---
name: dexalot-vaults
description: "Use this skill when the user asks for: list of every OmniVault on Dexalot, OmniVaults owned by or associated with the connected wallet, a single vault scoped to the account, vault asset composition + USD value weights, recent vault transfers (deposits/withdrawals) for the account, the OmniVault creation configuration (supported assets, minimums, fees), or to submit a new OmniVault creation request (POST signed REST — NOT an on-chain transaction; Dexalot deploys the actual contract off-band). Public lookups (all vaults, vault assets, creation config) work without a wallet; account-scoped lookups and create_vault require DEXALOT_PRIVATE_KEY. Do NOT use for placing CLOB orders (dexalot-clob), portfolio subnet balances (dexalot-portfolio), or RFQ swaps (dexalot-swap)."
license: MIT
metadata:
  author: dexalot-trade-kit
  version: "0.1.0"
  homepage: "https://app.dexalot.com"
  agent:
    requires:
      bins: ["dexalot"]
    install:
      - id: npm
        kind: node
        package: "@dexalot-trade-kit/cli@0.1.0"
        bins: ["dexalot"]
        label: "Install dexalot CLI (npm)"
---

# Dexalot OmniVaults CLI

Multi-asset OmniVault discovery, account-scoped vault holdings, asset composition, transfers, and the creation contact flow.

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). Public lookups (all vaults, vault assets, creation config) work without a wallet; the rest require one.

## Command index

| Command | Auth | Description |
|---|:-:|---|
| `dexalot vaults get-all-vaults` | — | List every OmniVault |
| `dexalot vaults get-vaults-by-account` | ✓ | Vaults owned by/associated with the account |
| `dexalot vaults get-single-vault-by-account --id N` | ✓ | One vault scoped to the account |
| `dexalot vaults get-vault-assets --vaultid N` | — | Asset composition + USD weights |
| `dexalot vaults get-vault-transfers --vaultid N` | ✓ | Recent deposits/withdrawals for the account |
| `dexalot vaults get-creation-config` | — | Supported assets, minimums, fees |
| `dexalot vaults create-vault --env E --initial_tx 0x... --email a@b.c [--tg_id ...] [--x_id ...]` | ✓ | Submit a creation request (POST, off-band processing) |

## Workflow

### Browse vaults

```bash
dexalot vaults get-all-vaults
dexalot vaults get-vault-assets --vaultid 1
```

### Check your vault holdings

```bash
dexalot vaults get-vaults-by-account --profile live
dexalot vaults get-vault-transfers --vaultid 1 --profile live
```

### Request creation of a new vault

```bash
# 1. Confirm the creation config
dexalot vaults get-creation-config

# 2. Submit the request (signed POST — backend will follow up off-band)
dexalot vaults create-vault \
  --env production-multi-avax \
  --initial_tx 0xINITIALTXHASH \
  --email me@example.com \
  --tg_id mytghandle \
  --profile live
```

## Notes

- `create_vault` is the only `isWrite: true` tool here. It's signed REST POST, not on-chain — under `--read-only` it's dropped from the registered set.
- Dexalot's backend processes vault creation manually; expect off-band contact via the email provided.
