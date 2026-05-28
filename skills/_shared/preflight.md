# Dexalot CLI Preflight

Execute these steps **once per session**, before running any Dexalot skill command.

## Step 1 — Verify CLI is available

```bash
dexalot --version
```

If the command is not found, ask the user to install:

```bash
npm install -g @dexalot/trade-cli @dexalot/trade-mcp
```

## Step 2 — Detect profile / network (once per session)

```bash
dexalot config list-profile
```

This prints every profile in `~/.dexalot/config.toml` with its network and a marker (`*`) on the default profile. Use the output to pick a `--profile <name>` for subsequent commands.

If no profile is configured, the user must initialise one (see Step 3) or pass `DEXALOT_PRIVATE_KEY` / `--network` via env / flags.

## Step 3 — First-time setup (only if Step 2 returned no profiles)

```bash
dexalot config init
```

Interactive wizard that prompts for:
- profile name (default `default`)
- network: `mainnet`, `testnet`, or `devnet`
- wallet private key (masked input; optional — leave blank for read-only public data)

If devnet is chosen the wizard also accepts a custom `api_base_url`.

## Step 4 — Confirm capabilities the agent will use

```bash
dexalot discovery --json
```

Lists every registered tool grouped by module. Use this to learn which actions are available without parsing `--help` text. Skip if you already know the command set.

## Step 5 — Skill version drift check

```bash
dexalot --version
```

Compare against this skill's `metadata.version` (from the calling `SKILL.md` frontmatter):

1. If the CLI version contains a prerelease suffix (`-beta`, `-rc`, etc.), skip the check.
2. If CLI stable version **>** skill `metadata.version`, show this warning **once per session**:

   > ⚠️ CLI version is ahead of this skill. Some new commands may not be documented here. Refresh the skill before relying on undocumented behavior.

3. If you already warned this session, skip.

## Network selection (every command)

Every Dexalot command accepts:

| Flag | Effect |
|---|---|
| `--profile <name>` | Use a specific profile from `~/.dexalot/config.toml`. |
| `--network mainnet\|testnet\|devnet` | Override the network. |
| `--testnet` / `--devnet` | Shorthand for `--network testnet` / `--network devnet`. |
| `--live` | Force mainnet (refuses to start if profile says testnet/devnet). |

Default: `mainnet`. The MCP server's `system_get_capabilities` tool reports the active network in every response so agents always know which environment they are operating against.

## Output flags

| Flag | Effect |
|---|---|
| (none) | Pretty-print just the data payload. |
| `--json` | Pretty-print the full `ToolResult { endpoint, requestTime, data }`. |
| `--env` | Wrap output as `{ env, profile, data }` for scripts that pipe between profiles. |
| `--verbose` | Log request/response details to stderr (useful for debugging). |
