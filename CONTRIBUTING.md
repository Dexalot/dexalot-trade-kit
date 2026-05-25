# Contributing to Dexalot Trade Kit

Thank you for your interest in contributing!

## Development environment

- Node.js ≥ 18 (the CI matrix runs on 20.x and 22.x)
- pnpm ≥ 9 (`corepack enable && corepack use pnpm@9`)
- Git

## Setup

```bash
git clone <repo>
cd dexalot-trade-kit
pnpm install
pnpm build
pnpm typecheck
pnpm test:unit
```

## Adding a tool

See the workflow in [CLAUDE.md](CLAUDE.md#adding-a-new-tool):

1. Add a `ToolSpec` to the appropriate file under `packages/core/src/tools/`.
2. Register it in `packages/core/src/tools/index.ts`.
3. Add a CLI dispatch entry under `packages/cli/src/commands/<module>.ts`.
4. Unit test in `packages/core/test/` (mock the client + contract; no live network).
5. If user-visible, update `skills/dexalot-<module>/SKILL.md` and bump its `metadata.version`.

## Tests

- **Unit:** mocked clients, no network — `pnpm test:unit` (must stay green).
- **Smoke (devnet, read-only):** `bash test/smoke.sh` — runs in CI on `main`.
- **Write-side / on-chain tests:** held behind a manual gate; not part of CI.

The Codex CLI enforces a 1024-char ceiling on every SKILL.md `description`. We target ≤900 chars and the CI test in `packages/cli/test/skill-description-length.test.ts` fails the build if exceeded.

## PR guidelines

- One module / one feature per PR where possible.
- Run `pnpm typecheck && pnpm test:unit && bash test/smoke.sh` before opening.
- Update relevant `docs/modules/<module>.md` and the matching `skills/dexalot-<module>/SKILL.md` when adding or renaming tools.
- New env vars or TOML profile fields must also land in `.env.example` and `config.toml.example`.

## Code style

- TypeScript strict mode (no implicit any).
- No emojis in code or commit messages.
- Comments only when WHY is non-obvious (a constraint, an invariant, a workaround).
- Keep handler files small and focused — one module per file.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability disclosure.
