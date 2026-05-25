# `vaults` module

OmniVault discovery, per-account holdings, asset composition, transfers, and the (signed REST POST) creation contact form.

| Tool | CLI | Route |
|---|---|---|
| `vaults_get_all_vaults` | `dexalot vaults get-all-vaults` | TRADE_API `GET omnivault-info` |
| `vaults_get_vaults_by_account` | `dexalot vaults get-vaults-by-account` | SIGNED_API `GET omnivault-info` |
| `vaults_get_single_vault_by_account` | `dexalot vaults get-single-vault-by-account --id N` | SIGNED_API `GET omnivault-info?id=N` |
| `vaults_get_vault_assets` | `dexalot vaults get-vault-assets --vaultid N` | TRADE_API `GET omnivault-assets` |
| `vaults_get_vault_transfers` | `dexalot vaults get-vault-transfers --vaultid N` | SIGNED_API `GET omnivault-transfers` |
| `vaults_get_creation_config` | `dexalot vaults get-creation-config` | TRADE_API `GET omnivault-creation` |
| `vaults_create_vault` ⚠ write | `dexalot vaults create-vault --env E --initial_tx 0x... --email a@b.c` | SIGNED_API `POST omnivault-contact` |

**`vaults_create_vault` is signed REST POST, NOT an on-chain transaction.** It registers a creation request; Dexalot deploys the vault contract off-band based on the contact info provided.
