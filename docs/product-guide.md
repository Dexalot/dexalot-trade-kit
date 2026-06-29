# Trade on Dexalot by just… asking

*Meet the Dexalot Trade Kit — an AI-native way to trade, transfer, and analyze on the Dexalot DEX, straight from Claude, Cursor, or your terminal. Your keys stay yours. Nothing leaves your machine.*

---

Trading on-chain usually means juggling tabs: the DEX in one window, a block explorer in another, your wallet popping up, a spreadsheet for P&L somewhere off-screen. You already know *what* you want to do — "sell a little ETH," "move funds to Arbitrum," "how did my week go" — but you spend your energy clicking through to do it.

The **Dexalot Trade Kit** collapses all of that into a conversation. You tell your AI assistant what you want, and it calls the right Dexalot actions for you — quotes, orders, deposits, withdrawals, balances, analytics. It runs entirely **on your machine** as a private process. There's no service of ours in the middle, and your private key never has to leave your device (with WalletConnect, it never even touches it).

## A quick taste

Once it's connected to Claude (or Cursor, Windsurf, VS Code…), trading looks like this:

> **You:** what are my Dexalot balances?
> **Assistant:** *(calls `portfolio_get_all_balances)`* You have 0.31 ETH, fully available.
>
> **You:** sell 0.002 ETH for USDC at market
> **Assistant:** *(confirms, then `clob_place_order`)* Done — market sell, tx `0x3e71…bee4`.
>
> **You:** withdraw 0.0015 ETH to Arbitrum Sepolia
> **Assistant:** *(calls `transfer_withdraw`)* Submitted — tx `0xff01…a5b4`. The bridge will credit your wallet shortly.

No dashboards, no copy-pasting addresses. You describe the intent; the assistant handles the tool calls and reports back. And because every response tells the assistant exactly what it's allowed to do, it never tries to place an order you haven't enabled.

## One kit, two ways in

Under the hood, the kit is a single brain with two faces.

The **brain** (`@dexalot/trade-core`) holds everything that matters: the catalog of trading actions, your config and profiles, signing and authentication, the Dexalot REST and on-chain clients, rate limiting, and error handling.

On top of it sit two thin **surfaces**:

- **`@dexalot/trade-mcp`** — an MCP server that AI assistants talk to. This is what makes "just ask" work in Claude Desktop, Cursor, Windsurf, VS Code, or Claude Code.
- **`@dexalot/trade-cli`** — a terminal command (`dexalot`) for the same actions, scriptable for power users and automation.

Both faces call the *exact same* logic, so the AI and the CLI never drift apart — `dexalot market get-pairs` in your shell and `market_get_pairs` in chat do precisely the same thing. Add a capability once, and both get it for free.

## What it can actually do

Quite a lot. The kit exposes **80 tools across 13 modules** — the full Dexalot surface, not a toy subset:

- **Trade the order book** — place, cancel, and replace limit and market orders, including batches; read your open orders and history.
- **Swap** — RFQ quotes (soft and firm) and one-shot swap execution.
- **Move money** — deposit and withdraw across chains, bridge fees, gas top-ups, portfolio transfers.
- **See everything** — balances across the Dexalot L1 and connected chains, USD prices and price history, 24h stats, volumes, top pairs and tokens, APYs.
- **Go deeper** — the leaderboard and reward breakdowns, OmniVaults (including creating one), trader history, P&L, and announcements.

Eighteen of those tools move funds or place orders. Those are gated behind an explicit opt-in — by default the kit boots **read-only**, so market data and balances work with no wallet and no risk, and trading only turns on when you say so.

## Skills: it already knows how to trade

A powerful API is only useful if the assistant knows *when* to reach for each piece. So the kit ships **12 skills** — short playbooks that teach the AI how to use each module well: how to quote before swapping, how to read the order book, how to confirm before a withdrawal. Install the kit and the assistant comes pre-briefed; you don't have to explain Dexalot to it.

## Your keys, your call

This is the part traders care about most. The kit gives you three ways to sign, so you can match security to the situation:

1. **Local key** — fast and simple, encrypted at rest in a vault on your machine. Great for active, hands-on trading.
2. **Autonomous (vault)** — the same encrypted key, unlocked from an environment secret, for unattended strategies that need to act without a human in the loop.
3. **WalletConnect** — *no private key on the machine at all.* The kit pairs with your wallet by QR code, and **every signature and transaction is approved in your wallet app.**

That third option is the headline. Connect a mobile or hardware wallet, and the kit can authenticate, read your signed data, place orders, and withdraw — while the key never leaves your wallet and nothing happens without your explicit tap. It's the safest way to let an AI trade on your behalf: powerful, but always asking permission. (It's *attended* by design — for fully autonomous bots, the vault mode is the right tool.)

## Set it up in about a minute

```bash
# 1) Connect the kit to your AI client (starts read-only, no wallet needed)
npx -y @dexalot/trade-mcp setup --client claude-desktop

# 2) Add a wallet and turn on trading — one interactive wizard
npx -y @dexalot/trade-cli config init
```

The wizard asks for a network (mainnet, testnet, or devnet), how you want to sign (local key, WalletConnect, or read-only), and which AI clients to wire up — then registers them for you. Restart your client and ask it *"what are my Dexalot capabilities?"* to confirm you're live. Prefer the terminal? The same `dexalot` command works standalone, and Claude Code users can grab it from the plugin marketplace in one step.

## Built to be safe

- **Local-first.** It's your process on your machine. No backend of ours, no data leaving the device.
- **Read-only by default.** Writes are always an explicit opt-in; `--read-only` strips them entirely.
- **Approve-everything mode.** With WalletConnect, every action needs a tap in your wallet.
- **No surprise actions.** If an error hints at a "fix" that would move funds, the assistant reports it and waits for you — it won't act on its own.
- **Always honest about itself.** Every response declares what's enabled, which network is active, and whether a wallet is connected, so the assistant never overreaches.

## Try it

The Dexalot Trade Kit is open source (MIT). Point your AI at it, ask for your balances, and place your first order in plain English.

```bash
npx -y @dexalot/trade-mcp setup --client claude-desktop
```

Then just… ask.

---

*Repo: `Dexalot/dexalot-trade-kit` · Packages: `@dexalot/trade-core`, `@dexalot/trade-mcp`, `@dexalot/trade-cli` · See also [README.md](../README.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).*
