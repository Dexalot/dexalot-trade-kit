# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| Latest minor (`0.x`) | ✅ |

Pre-1.0 — only the latest published minor is supported.

## Reporting a vulnerability

If you find a security issue, please **do not** open a public GitHub issue. Email the Dexalot security team with:

- A description of the vulnerability
- Steps to reproduce
- Affected version
- Any proof-of-concept code

We aim to acknowledge within 48 hours and ship a fix or mitigation within 7 days for high-severity issues.

## Scope

In scope:

- The CLI (`@dexalot/trade-cli`) and MCP server (`@dexalot/trade-mcp`) binaries.
- The core library (`@dexalot/trade-core`).
- The skills tree under `skills/`.
- Config loading (`~/.dexalot/config.toml`, env var precedence).
- Signature handling (`x-signature` cache, the static `"dexalot"` message).

Out of scope (report upstream):

- The Dexalot REST backend (`api.dexalot.com`, `api.dexalot-test.com`, `api.dexalot-dev.com`).
- The Dexalot smart contracts.
- `@dexalot/dexalot-sdk` (report to the SDK repo).
- `ethers`, `undici`, `smol-toml` (report to their maintainers).

## Handling private keys

This kit never transmits a private key to a remote service. The key lives only in `~/.dexalot/config.toml` or the `DEXALOT_PRIVATE_KEY` env var on the operator's machine. It is loaded once at startup, used to sign the static message `"dexalot"`, then the signature is cached and the raw key is never reused after the wallet is constructed by `ethers`.

If you spot any path where a private key is logged, transmitted, or persisted outside `~/.dexalot/`, please report it as a high-severity issue.
