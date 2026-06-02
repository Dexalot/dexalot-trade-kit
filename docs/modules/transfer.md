# `transfer` module

Cross-chain bridge ops (deposit/withdraw), gas management, P2P transfers, history.

| Tool | CLI | Route |
|---|---|---|
| `transfer_deposit` ⚠ write | `dexalot transfer deposit --token T --amount N --sourceChain C` | SDK `deposit` |
| `transfer_withdraw` ⚠ write | `dexalot transfer withdraw --token T --amount N --destinationChain C` | SDK `withdraw` |
| `transfer_add_gas` ⚠ write | `dexalot transfer add-gas --amount N` | SDK `addGas` |
| `transfer_remove_gas` ⚠ write | `dexalot transfer remove-gas --amount N` | SDK `removeGas` |
| `transfer_portfolio` ⚠ write | `dexalot transfer portfolio --token T --amount N --toAddress 0x...` | SDK `transferPortfolio` |
| `transfer_get_deposit_bridge_fee` | `dexalot transfer get-deposit-bridge-fee --token T --amount N --sourceChain C` | SDK `getDepositBridgeFee` |
| `transfer_get_token_details` | `dexalot transfer get-token-details --token T` | SDK `getTokenDetails` |
| `transfer_get_combined_transfers` | `dexalot transfer get-combined-transfers` | SDK `getCombinedTransfers` |

**Notes:**
- `add-gas` withdraws native ALOT from portfolio to wallet (raises gas balance for paying subnet fees). `remove-gas` is the reverse.
- `transfer-portfolio` is a P2P transfer on the subnet — no bridge involved.
- `--read-only` drops the 5 writes.
