# mcp-compose Migration Notes

`mcp-compose.json` and `mcp_compose.toml` are retired. MCP server configuration now lives in `mcp.servers.json`, projected into `opencode.json` and `.mcp.json` by `bin/sync-mcp.mjs`. See [`docs/mcp.md`](mcp.md) for the current setup.

## What Changed

| Before | After |
|---|---|
| `mcp-compose.json` declared servers, `mcp-compose` synced them to Claude config | `mcp.servers.json` declares servers, `bin/sync-mcp.mjs` projects them into `opencode.json` and `.mcp.json` |
| Sync wrote to a global target (`~/.mcp.json` via `claudeConfigPath`) | Projections write directly to committed project files |
| Serena excluded from `mcp-compose.json`; configured separately in `opencode.json` | Both `serena` and `jetbrains` managed from `mcp.servers.json` |
| `mcp_compose.toml` preceded `mcp-compose.json`; now fully retired | No TOML file; do not recreate it |

Clients that previously read `mcp-compose.json` entries through the global sync target no longer receive them from that path. Each client now reads its own committed projection directly: OpenCode reads `opencode.json`; Claude and other MCP-compatible clients read `.mcp.json`.

## mcp-compose Sync State

If `~/.mcp-compose/sync-state.json` exists on this machine, it records the client config targets and server names that were previously managed by `mcp-compose`. Read it only to identify project-specific entries that may need manual cleanup — do not use it to infer the current active configuration.

The sync-state for `uny-core` referenced entries under a previous project path (`/home/owner/projects/UN1Q-com/uny/`). That path is no longer the active project root. Entries there are stale and belong to the old location, not this repository.

**Known stale sync-state targets** (project-specific only; global targets are not this project's concern):

- `/home/owner/projects/UN1Q-com/uny/.mcp.json` — previously managed `serena` and `jetbrains` entries
- `/home/owner/projects/UN1Q-com/uny/.codex/config.toml` — previously managed `serena` and `jetbrains` entries

These targets are outside this repository. If they still contain entries that point at the same endpoints now managed by `mcp.servers.json` (`http://127.0.0.1:64342/sse` for `jetbrains`, the Serena uvx command for `serena`), those entries are now redundant.

## Manual Cleanup

Cleanup is optional and applies only to the stale targets listed above. Take no global action.

**Rules:**

- Never run `mcp-compose down` without reviewing the specific targets affected. A global `down` can remove unmanaged entries in shared client config files.
- Do not delete any entry in a file you do not own. Only remove entries that exactly match the endpoints managed by this project (`jetbrains` SSE at `http://127.0.0.1:64342/sse`, or the Serena uvx stdio entry).
- Do not touch the global `~/.mcp.json` unless you have verified it was written by `mcp-compose` for this project and no other project is using those entries.

**Stale `.mcp.json` entry pattern** (match before removing):

```json
"serena": { "type": "stdio", "command": "...", ... }
"jetbrains": { "type": "sse", "url": "http://127.0.0.1:64342/sse" }
```

If the stale target files no longer exist, no cleanup is needed.

## Known Invalid Settings

The following `mcp-compose.json` settings are invalid in the current tooling and should not be used as a reference:

| Setting | Why invalid |
|---|---|
| `settings.claudeConfigPath` (`~/.mcp.json`) | `sync-mcp` does not use a global target path; it writes directly to committed project files |
| `mcpServers.jetbrains.type: "sse"` | Still valid as a server type, but the entry is now owned by `mcp.servers.json`, not `mcp-compose.json` |

No configuration from `mcp-compose.json` is read by any current tooling. The file has been deleted.
