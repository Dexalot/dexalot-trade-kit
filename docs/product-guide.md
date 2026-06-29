# Dexalot Trade Kit — Product Guide

An AI-native toolkit that connects assistants like **Claude, Cursor, and VS Code** — and a terminal CLI — directly to the **Dexalot DEX**. You describe what you want ("show my balances", "sell 0.002 ETH", "withdraw to Arbitrum"), and the assistant calls the right tool. It runs **locally** as a private process; your wallet key stays on your machine (optionally encrypted) or never touches it at all (WalletConnect). No backend service of ours, nothing leaves the device except calls to Dexalot.

---

## Who it's for

- **Traders who want an AI copilot** for Dexalot — quote, trade, deposit/withdraw, check P&L, all in chat.
- **Developers / power users** who want a scriptable CLI over the same surface.
- **Builders** embedding Dexalot actions into AI agents.

---

## How it works — one core, two surfaces

```
  Claude / Cursor / VS Code         Terminal
        │ (MCP, stdio JSON-RPC)        │ (argv)
        ▼                              ▼
  @dexalot/trade-mcp            @dexalot/trade-cli
        └──────────────┬───────────────┘
                       ▼
              @dexalot/trade-core
        (shared tool registry · config · auth · clients)
                       │
         ┌─────────────┴──────────────┐
         ▼                            ▼
   Dexalot REST API           @dexalot/dexalot-sdk
   (analytics, info, …)       (on-chain: orders, transfers, swaps)
```

Three packages:

| Package | What it is |
|---|---|
| **`@dexalot/trade-core`** | The shared engine — the tool registry, config/profiles, auth/signing, REST + on-chain clients, rate limiting, errors. |
| **`@dexalot/trade-mcp`** | The **MCP server** AI clients talk to (stdio JSON-RPC). Binary: `dexalot-trade-mcp`. |
| **`@dexalot/trade-cli`** | The **terminal CLI**. Binary: `dexalot`. |

Both surfaces are thin: parse input → call the **same** tool handler in core → return the **same** result. Add a tool once, both the AI and the CLI get it.

---

## What you can do — capabilities

**80 tools across 13 modules.** 18 are write / on-chain actions (orders, deposits, withdrawals, swaps, vault creation) and are gated behind an explicit opt-in (`--read-only` drops them).

| Module | Tools | What it covers | On-chain writes? |
|---|---:|---|:--:|
| **market** | 9 | Trading pairs, tokens, order book, candles, deployed contracts, environments | — |
| **clob.read** | 4 | Open orders, order by id / client-id, orders by account | — |
| **clob.write** | 9 | Place / cancel / replace orders, batch order ops | ✅ |
| **swap** | 4 | RFQ swap pairs, soft + firm quotes, execute swap | ✅ (execute) |
| **portfolio** | 9 | Balances (Dexalot L1 + multi-chain), USD prices, price history, balance proof | — |
| **transfer** | 8 | Deposit, withdraw, add/remove gas, portfolio transfer, bridge fee, token details, history | ✅ (deposit/withdraw/…) |
| **analytics** | 7 | 24h stats, daily volumes, top pairs/tokens, APYs, burned-fee data | — |
| **leaderboard** | 12 | Top traders, breakdowns, claim info + signatures, incentives | — |
| **vaults** | 7 | OmniVaults: list, by account, assets, transfers, creation config, create | ✅ (create) |
| **rewards** | 4 | Claim info + signatures, subnet incentives, Merkl staking | — |
| **trader_history** | 2 | Trade history, register | — |
| **info** | 4 | Announcements, volume-rebate tiers/account | — |
| **pnl** | 1 | Profit / loss | — |

Every tool response also carries a **capability snapshot** (`readOnly`, `hasWallet`, `network`, `address`, per-module availability) so the AI always knows what it's allowed to do.

---

## Surface 1 — MCP (AI assistants)

Once registered, the assistant has all the tools plus a `system_get_capabilities` meta-tool. Supported clients: **Claude Desktop, Cursor, Windsurf, VS Code, Claude Code CLI** (any MCP-compatible host).

Typical chat usage:
> "What are my Dexalot balances?" → `portfolio_get_all_balances`
> "Sell 0.002 ETH for USDC at market" → `clob_place_order`
> "Withdraw 0.0015 ETH to Arbitrum Sepolia" → `transfer_withdraw`

The server starts **read-only on mainnet** by default — market data and reads work with no wallet. Trading is enabled per the profile (see Setup).

---

## Surface 2 — CLI

Pattern: `dexalot <module> <action> [flags]` (CLI hyphens map to MCP underscores — `market get-pairs` ↔ `market_get_pairs`).

```bash
dexalot market get-pairs --network devnet         # public read, no wallet
dexalot portfolio get-all-balances --profile live # signed read
dexalot clob place-order ...                       # see `dexalot clob --help`
dexalot wallet connect                             # pair a WalletConnect wallet
dexalot config init                                # interactive setup wizard
dexalot --help                                     # full command list
```

Global flags include `--network mainnet|testnet|devnet` (and `--testnet`/`--devnet`/`--live`), `--profile <name>`, `--read-only`, `--json` (machine output), `--verbose`. Run `dexalot <module> --help` for a module's actions and flags.

---

## Skills — the AI playbooks

The kit ships **12 skill files** (`skills/dexalot-*`) — Markdown playbooks that tell an AI agent *when* and *how* to use each module's tools, plus a shared `skills/_shared/preflight.md` for once-per-session setup. They cover: **market, clob, swap, portfolio, transfer, analytics, leaderboard, vaults, rewards, trader-history, pnl, info**. With the plugin install, these load automatically so the agent uses the tools correctly without hand-holding.

---

## Setup

### Fastest path

```bash
# 1) Register the MCP server with your AI client (read-only, mainnet)
npx -y @dexalot/trade-mcp setup --client claude-desktop   # or cursor | windsurf | vscode | claude-code

# 2) (Optional) add a wallet + enable trading — interactive wizard
npx -y @dexalot/trade-cli config init
```

The `config init` wizard asks for a **profile name**, **network**, and a **signing method**:

```
How do you want to sign & authenticate?
  [1] Private key   — stored encrypted in the Dexalot secrets vault
  [2] WalletConnect — no key on disk; approve each signature in your wallet app
  [3] None          — read-only (public market data only)
```

…then a **checkbox** auto-registers the MCP clients you pick (Claude Desktop, Cursor, Windsurf, VS Code, Claude Code). Restart the client and you're live. Config lives at `~/.dexalot/config.toml`.

### Claude Code plugin

```
/plugin marketplace add dexalot/dexalot-trade-kit
/plugin install dexalot-trade@dexalot-trade-kit
```
Installs the skills + bundled MCP server in one step.

---

## Signing & security

Three signing modes, chosen per profile:

| Mode | Where the key lives | Approval per action | Best for |
|---|---|---|---|
| **Plaintext key** | `private_key` in config / `DEXALOT_PRIVATE_KEY` | none | local dev, CI |
| **Secrets vault** | encrypted on disk (Fernet, `~/.dexalot/secrets_vault.json`); unlocked by `DEXALOT_VAULT_KEY` | none | **unattended / autonomous** trading |
| **WalletConnect** | **only in the user's wallet app** | **every signature & tx, in the wallet** | no key on the machine; human-in-the-loop; demos |

- **Read-only works with no key** — public market/analytics/info data needs no wallet. `--read-only` also drops every write tool regardless of key.
- **Vault** keeps the key encrypted at rest; the one-time vault key is shown once at setup and supplied at runtime via env (source it from your OS keychain).
- **WalletConnect** is the zero-key-on-disk option: the kit pairs with the wallet via a QR code and every action is approved there — an **opt-in, attended** mode (not for unattended bots). Surfaces: CLI `dexalot wallet connect|status|disconnect`; MCP `wallet_connect` / `wallet_connect_status` / `wallet_disconnect` (the connect tool returns a QR to scan). Because orders, withdrawals, and transfers execute on the **Dexalot L1** (a custom Avalanche subnet — `432204` mainnet / `432201` testnet), the user's wallet must have that network added; the kit requests every chain the active environment supports at pairing and reports what got approved via `wallet_connect_status`. Deposits execute on the source chain, which the wallet usually already has.

---

## Networks

| Network | API base | Use |
|---|---|---|
| **mainnet** | `api.dexalot.com` | live trading |
| **testnet** | `api.dexalot-test.com` | public test (Fuji) |
| **devnet** | `api.dexalot-dev.com` | internal dev/testing |

Select with `--network` (CLI/MCP), `DEXALOT_NETWORK`, or the profile. Testnet/devnet are great for trying flows without real funds.

---

## Why it's safe

- **Local-first:** runs as a private process; no key leaves the machine (and with WalletConnect, none is on it).
- **Read-only by default:** the MCP server boots read-only; writes are an explicit opt-in.
- **Attended option:** WalletConnect requires a wallet approval for every action.
- **Capability-aware:** every response states what's enabled, so the agent never assumes a tool it can't use.
- **Guardrails:** the MCP server won't auto-execute write "remediations" suggested by an error — it reports and waits for confirmation.

---

## Reference

- **Repo:** `Dexalot/dexalot-trade-kit`
- **Packages:** `@dexalot/trade-core`, `@dexalot/trade-mcp`, `@dexalot/trade-cli`
- **In-repo docs:** [README.md](../README.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) · `skills/README.md`
- **License:** MIT
