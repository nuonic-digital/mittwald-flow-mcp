# mittwald-flow-mcp

An MCP server that provides access to the [mittwald flow](https://mittwald.github.io/flow/) component library documentation. Designed for use with AI coding assistants like Claude Code.

## Tools

| Tool | Description |
|------|-------------|
| `list_components` | List all components, optionally filtered by category |
| `get_component_overview` | Get overview documentation with usage examples |
| `get_component_develop` | Get property tables, events, and accessibility props |
| `get_component_guidelines` | Get usage guidelines and best practices |

Component slugs (e.g. `button`, `text-field`) are used as identifiers. Categories are auto-detected when omitted.

## Setup

Requires [Bun](https://bun.sh/) (runtime and package manager).

```bash
bun install
```

This installs dependencies and Playwright Chromium (via `postinstall`).

## Usage

### With Claude Code

Add to your Claude Code MCP config (`~/.claude/claude_code_config.json` or project-level `.claude/settings.json`):

```json
{
  "mcpServers": {
    "mittwald-flow-docs": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/mittwald-flow-mcp/src/index.ts"]
    }
  }
}
```

### Standalone

```bash
bun run start
```

The server communicates over stdio using the [Model Context Protocol](https://modelcontextprotocol.io/).

## Architecture

| Data | Source | Reason |
|------|--------|--------|
| Component list | GitHub API (tree endpoint) | Single call, gives full structure |
| Overview / Guidelines | Raw MDX from GitHub | Already markdown, cleaned of JSX |
| Develop (properties) | Playwright (headless Chromium) | Property tables are client-rendered |

Results are cached in-memory with configurable TTLs (30–120 min depending on data type).

## Development

```bash
# Type check
bunx tsc --noEmit

# Test with MCP inspector
bunx @modelcontextprotocol/inspector
```
