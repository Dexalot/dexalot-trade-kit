# `portfolio` module

Wallet balances on the Dexalot subnet and connected chains, plus USD pricing and balance proofs.

| Tool | CLI | Route |
|---|---|---|
| `portfolio_get_balance` | `dexalot portfolio get-balance --token T` | SDK `getPortfolioBalance` |
| `portfolio_get_all_balances` | `dexalot portfolio get-all-balances` | SDK `getAllPortfolioBalances` |
| `portfolio_get_chain_balance` | `dexalot portfolio get-chain-balance --chain C --token T` | SDK `getChainWalletBalance` |
| `portfolio_get_chain_balances` | `dexalot portfolio get-chain-balances --chain C` | SDK `getChainWalletBalances` |
| `portfolio_get_all_chain_balances` | `dexalot portfolio get-all-chain-balances` | SDK `getAllChainWalletBalances` |
| `portfolio_get_token_usd_prices` | `dexalot portfolio get-token-usd-prices` | INFO_API `GET usd-prices` |
| `portfolio_get_token_usd_price_history` | `dexalot portfolio get-token-usd-price-history --token T` | INFO_API |
| `portfolio_get_token_hourly_usd_price_history` | `dexalot portfolio get-token-hourly-usd-price-history --token T` | INFO_API |
| `portfolio_get_balance_proof` | `dexalot portfolio get-balance-proof --symbol T` | SIGNED_API `GET balanceproof` |

**Notes:**
- All balance reads route through the SDK (contract reads on the Portfolio subnet contract or on-chain ERC20/native reads).
- USD pricing endpoints are public (no wallet).
- Balance proof requires the signed REST header (wallet must be configured).
