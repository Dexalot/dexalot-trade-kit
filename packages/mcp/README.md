# @dexalot/trade-mcp

MCP server for the Dexalot DEX, designed for AI tools like Claude Code, Cursor,
Windsurf, and VS Code. Exposes 79 tools across 13 modules via the Model Context
Protocol over stdio.

### Install

```bash
npm install -g @dexalot/trade-mcp @dexalot/trade-cli
```

### Configure credentials

Run the interactive wizard:

```bash
dexalot init
```

…or hand-edit `~/.dexalot/config.toml`:

```toml
default_profile = "live"

[profiles.live]
private_key = "0x..."
network     = "mainnet"

[profiles.test]
private_key = "0x..."
network     = "testnet"
```

### Run

```bash
dexalot-trade-mcp                                  # defaults (no wallet needed)
dexalot-trade-mcp --read-only --modules all        # all reads, zero writes
dexalot-trade-mcp --profile live --modules all     # full trading
dexalot-trade-mcp --network testnet                # testnet override
dexalot-trade-mcp --help
```

### Register with an MCP host

Most people should just run the one-step wizard, which sets up signing **and** connects your AI tools:

```bash
npx -y @dexalot/trade-cli init
```

For scripting / CI, register a single client non-interactively:

```bash
dexalot-trade-mcp setup --client claude-code
dexalot-trade-mcp setup --client claude-desktop
dexalot-trade-mcp setup --client cursor
dexalot-trade-mcp setup --client windsurf
dexalot-trade-mcp setup --client vscode   # writes .mcp.json in cwd
dexalot-trade-mcp setup --client codex    # writes ~/.codex/config.toml
```

> **ChatGPT** connects to remote MCP servers only — it can't run a local command, so use its Developer-mode connector flow instead.

…or hand-edit your client config (Claude Desktop shown):

```json
{
  "mcpServers": {
    "dexalot-live": {
      "command": "npx",
      "args": ["-y", "@dexalot/trade-mcp", "--profile", "live", "--modules", "all"]
    },
    "dexalot-testnet": {
      "command": "npx",
      "args": ["-y", "@dexalot/trade-mcp", "--profile", "test", "--network", "testnet"]
    }
  }
}
```

For more details, see the [repository README](../../README.md).
