## Summary

<!-- Describe what this PR changes and why. -->

## Changes

<!-- List the key changes made. -->

-

## Testing

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test:unit` passes
- [ ] `bash test/smoke.sh` passes (devnet read-only sweep)
- [ ] Manual verification described below

<!-- For write-side changes (clob.write, transfer writes, swap.execute, vaults.create_vault),
     describe the testnet/devnet wallet smoke you ran. -->

## Checklist

- [ ] New env vars / TOML fields landed in `.env.example` + `config.toml.example`
- [ ] Affected `docs/modules/<module>.md` updated
- [ ] Affected `skills/dexalot-<module>/SKILL.md` command index updated; `metadata.version` bumped if user-visible
- [ ] No regressions in skills description length CI test (≤900 chars)
- [ ] No private keys, secrets, or `.env` content committed
