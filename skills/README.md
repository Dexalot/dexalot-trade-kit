# Dexalot Trade Kit — Agent Skills

Drop-in skill files for AI agent frameworks (Claude Code, Codex CLI, and any compatible runtime). Each skill tells the agent:

1. **When to activate** — via the `description` field in the YAML frontmatter (max 900 characters, hard ceiling 1024 enforced by the Codex CLI).
2. **How to execute** — via a command index plus worked examples that call the `dexalot` CLI.

All skills call the CLI (`dexalot market get-pairs`), not MCP tool names directly. The CLI shares its tool registry with the MCP server, so behavior is identical.

## Catalog

| Skill | Auth required? | Stage |
|---|:-:|---|
| [`dexalot-market`](dexalot-market/SKILL.md) | No | 2 |
| [`dexalot-portfolio`](dexalot-portfolio/SKILL.md) | Yes | 3 |
| [`dexalot-analytics`](dexalot-analytics/SKILL.md) | No | 3 |
| [`dexalot-info`](dexalot-info/SKILL.md) | Mixed | 3 |
| [`dexalot-clob`](dexalot-clob/SKILL.md) | Yes | 4 |
| [`dexalot-swap`](dexalot-swap/SKILL.md) | Mixed | 5 |
| [`dexalot-transfer`](dexalot-transfer/SKILL.md) | Yes | 5 |
| [`dexalot-vaults`](dexalot-vaults/SKILL.md) | Mixed | 6 |
| [`dexalot-leaderboard`](dexalot-leaderboard/SKILL.md) | Mixed | 6 |
| [`dexalot-trader-history`](dexalot-trader-history/SKILL.md) | Yes | 6 |
| [`dexalot-rewards`](dexalot-rewards/SKILL.md) | Yes | 6 |
| [`dexalot-pnl`](dexalot-pnl/SKILL.md) | Yes | 6 |

## Conventions

- Every skill points to [`_shared/preflight.md`](_shared/preflight.md) for the once-per-session setup (CLI install check, profile listing, version drift).
- Skill `metadata.version` is bumped in lockstep with the CLI package version so the drift check works.
- CLI command names use **hyphens** (`dexalot market get-pairs`); MCP tool names use **underscores** (`market_get_pairs`). The skill body always uses the CLI form.
- Negative routing notes ("Do NOT use for X — use Y instead") inside `description` reduce mis-activation by other skills.
