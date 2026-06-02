# `portfolio` module

Wallet balances on the Dexalot subnet and connected chains, plus USD pricing and balance proofs.

| Tool | CLI | Route |
|---|---|---|
| `portfolio_get_balance` | `dexalot portfolio get-balance --token T` | SDK `getPortfolioBalance` |
| `portfolio_get_all_balances` | `dexalot portfolio get-all-balances` | SDK `getAllPortfolioBalances` |
| `portfolio_get_chain_balance` | `dexalot portfolio get-chain-balance --chain C --token T` | SDK `getChainWalletBalance` |
| `portfolio_get_chain_balances` | `dexalot portfolio get-chain-balances --chain C` | SDK `getChainWalletBalances` |
| `portfolio_get_all_chain_balances` | `dexalot portfolio get-all-chain-balances` | SDK `getAllChainWalletBalances` |
| `portfolio_get_token_usd_prices` | `dexalot portfolio get-token-usd-prices` | SDK `getTokenUsdPrices` |
| `portfolio_get_token_usd_price_history` | `dexalot portfolio get-token-usd-price-history --token T [--from N --to N]` | SDK `getTokenPriceHistory` |
| `portfolio_get_token_hourly_usd_price_history` | `dexalot portfolio get-token-hourly-usd-price-history --token T [--from N --to N]` | SDK `getTokenHourlyPriceHistory` |
| `portfolio_get_balance_proof` | `dexalot portfolio get-balance-proof --symbol T` | SIGNED_API `GET balanceproof` |

**Notes:**
- All balance reads route through the SDK (contract reads on the Portfolio subnet contract or on-chain ERC20/native reads).
- USD pricing endpoints now route through the SDK (`getTokenUsdPrices`, `getTokenPriceHistory`, `getTokenHourlyPriceHistory`). Public (no wallet); the SDK applies a client-side `from`/`to` window (unix seconds) over the canonical ascending `PricePoint[]` series.
- Balance proof remains REST-only (no SDK method) and requires the signed REST header (wallet must be configured).
