# mcp-compose Migration Notes

`mcp-compose.json` and `mcp_compose.toml` are retired. MCP server configuration now lives in `mcp.servers.json`, projected into `opencode.json` and `.mcp.json` by `bin/sync-mcp.mjs`. See [`docs/mcp.md`](mcp.md) for the current setup.

## What Changed

| Before | After |
|---|---|
| `mcp-compose.json` declared servers, `mcp-compose` synced them to Claude config | `mcp.servers.json` declares servers, `bin/sync-mcp.mjs` projects them into `opencode.json` and `.mcp.json` |
| Sync wrote to a global target via `claudeConfigPath` (obsolete in v0.7) | Projections write directly to committed project files |
| Serena excluded from `mcp-compose.json`; configured separately in `opencode.json` | Both `serena` and `jetbrains` managed from `mcp.servers.json` |
| `mcp_compose.toml` preceded `mcp-compose.json`; now fully retired | No TOML file; do not recreate it |

Clients that previously read `mcp-compose.json` entries through the global sync target no longer receive them from that path. Each client now reads its own committed projection directly: OpenCode reads `opencode.json`; Claude reads `.mcp.json`.

## mcp-compose Sync State

If `~/.mcp-compose/sync-state.json` exists, it records client config targets and server names previously managed by `mcp-compose`. Read it only to identify project-specific entries that may need manual cleanup — do not use it to infer the current active configuration.

**Review:** Inspect only entries scoped to this project root. Do not take global action on shared client config files.

**Ownership:** Do not delete any entry in a file you do not own. Only remove entries that exactly match the endpoints now managed by `mcp.servers.json`.

No configuration from `mcp-compose.json` is read by any current tooling. The file has been deleted.
