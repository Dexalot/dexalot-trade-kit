---
name: dexalot-info
description: "Use this skill when the user asks for: Dexalot announcements (high-priority urgent banner messages or general feature/release announcements), the volume rebate tier table (each tier's 30-day volume threshold and maker/taker discount basis points), or the connected account's current volume rebate state (rolling 30-day volume, current tier, effective fees). Account-rebate query requires a wallet; everything else is public. Always call high-priority-announcements before trading to confirm there are no active incidents. Do NOT use for trading actions (dexalot-clob), pricing data (dexalot-market or dexalot-portfolio), or trader rewards leaderboards (dexalot-leaderboard or dexalot-rewards)."
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
        package: "@dexalot/trade-cli@0.1.0"
        bins: ["dexalot"]
        label: "Install dexalot CLI (npm)"
---

# Dexalot Info CLI

Announcements, volume rebate tiers, and per-account rebate state. Call `info get-high-priority-announcements` at the start of any trading session.

**Skill routing:**
- Announcements + rebate info → `dexalot-info` (this skill)
- Token / pair metadata → `dexalot-market`
- Volume rankings & analytics → `dexalot-analytics`
- Trader rewards leaderboard → `dexalot-leaderboard`

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). The account-rebate command requires a wallet; the others do not.

## Command Index

| Command | Auth | Description |
|---|:-:|---|
| `dexalot info get-high-priority-announcements` | — | Urgent banner messages (outages, freezes) |
| `dexalot info get-announcements` | — | General announcements (releases, listings) |
| `dexalot info get-volume-rebate-tiers` | — | Tier table: 30d volume threshold → maker/taker discount (bps) |
| `dexalot info get-account-volume-rebate` | ✓ | Connected wallet's current tier + effective fees |

Action aliases: `urgent`, `announcements`, `rebate-tiers`, `account-rebate`.

## Workflows

### Pre-trade safety check

```bash
dexalot info get-high-priority-announcements
```

If the array is non-empty, surface the messages to the user and confirm before continuing. Don't auto-execute trades when an urgent announcement is active.

### Model fee schedule for a new trader

```bash
dexalot info get-volume-rebate-tiers
```

Returns each tier's `min_volume_30d`, `maker_discount_bps`, `taker_discount_bps`. Combine with the pair-level `maker_rate_bps` / `taker_rate_bps` from `dexalot market get-pairs` to compute effective fees.

### Check the current account's tier

```bash
dexalot info get-account-volume-rebate --profile live
```

Returns the wallet's trailing 30-day volume, the tier it qualifies for, and the resulting effective maker/taker fees.

## Notes

- `announcement/0` (level 0) is the high-priority feed shown in the prominent banner; `announcement/4` (level 4) is the regular feed in the app's notifications panel. Both are paginated by the backend — the CLI returns whatever the backend ships.
- A trader's tier updates daily on the backend; expect up to 24h lag.
