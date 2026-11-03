# MCP Configuration

This document describes the canonical MCP server configuration, the projection tooling, and the adoption lifecycle for new contributors.

## Overview

MCP server configuration for this project is managed through a single canonical source of truth:

```
mcp.servers.json
```

The `bin/sync-mcp.mjs` script reads this file and projects it into two client-specific formats:

| File | Client | Notes |
|---|---|---|
| `opencode.json` | OpenCode | Uses `{env:HOME}` syntax; `type: "local"` for stdio, `type: "remote"` for SSE |
| `.mcp.json` | Claude / MCP clients | Uses `${HOME}` syntax; `command`/`args`/`env` for stdio, `url` for SSE |

Both projection files are committed. `mcp.servers.json` owns the authoritative configuration for the `serena` and `jetbrains` servers.

## Canonical Format

`mcp.servers.json` uses a portable format with `${HOME}` variable references (not expanded at generation time):

```json
{
  "servers": {
    "serena": {
      "type": "stdio",
      "command": "${HOME}/.local/bin/uvx",
      "args": ["-p", "3.13", "--from", "git+https://github.com/oraios/serena",
               "serena", "start-mcp-server", "--context=ide",
               "--open-web-dashboard=false", "--project-from-cwd"],
      "env": {
        "BROWSER": "/bin/true"
      }
    },
    "jetbrains": {
      "type": "sse",
      "url": "http://127.0.0.1:64342/sse"
    }
  }
}
```

### Supported server types

| Type | Required fields | Optional fields |
|---|---|---|
| `stdio` | `command` (string), `args` (array) | `env` (object) |
| `sse` | `url` (string) | — |

### Variable references

Use `${HOME}` in `command`, `args`, and `env` values. The projection tool translates this to the client-specific syntax at generation time without expanding the variable at that moment.

## Managed Servers

The canonical file owns exactly the servers declared in `mcp.servers.json`. Currently managed:

- **`serena`** — [Serena](https://github.com/oraios/serena) semantic code tools via stdio. Launched per-client on demand using `uvx`; no shared/background process. The full path `${HOME}/.local/bin/uvx` is used to avoid PATH manipulation.
- **`jetbrains`** — JetBrains IDE MCP gateway via SSE at `http://127.0.0.1:64342/sse`.

All other entries in `opencode.json` and `.mcp.json` are unmanaged and are left untouched by sync-mcp.

## Projection Tool

### Usage

```bash
# Generate projections from mcp.servers.json (idempotent)
node bin/sync-mcp.mjs

# Check for drift without writing
node bin/sync-mcp.mjs --check

# Preview what would be written (no writes)
node bin/sync-mcp.mjs --dry-run

# Use a specific project root
node bin/sync-mcp.mjs --root /path/to/project

# Initial adoption of pre-existing entries (first-time migration)
node bin/sync-mcp.mjs --adopt
```

Or via the package script:

```bash
node --test tests/mcp.test.mjs   # run tooling tests
```

### Flags

| Flag | Description |
|---|---|
| `--check` | Validate projections match canonical. Exits 1 if any drift is detected. |
| `--dry-run` | Print the projected content; do not write any files. |
| `--root <dir>` | Project root directory (default: `process.cwd()`). |
| `--adopt` | Adopt pre-existing entries with matching names on first-time migration. See [Initial Adoption](#initial-adoption). |

### No dependencies

`bin/sync-mcp.mjs` uses only Node.js built-in modules (`node:fs/promises`, `node:path`, `node:process`). No `node_modules` installation is required to run it.

## Ownership and the Manifest

Ownership state is tracked in `.mcp.manifest.json`:

```json
{
  "managed": ["jetbrains", "serena"]
}
```

The manifest records which server names sync-mcp created. On subsequent runs:

- Managed entries are freely updated to reflect the current canonical.
- Entries not in the manifest are treated as unmanaged; sync-mcp will not overwrite them unless `--adopt` is given.
- Managed entries that are removed from `mcp.servers.json` are removed from projections.
- Unmanaged entries are never removed.

`.mcp.manifest.json` is committed alongside the projection files.

## Idempotence

Running `node bin/sync-mcp.mjs` multiple times produces the same output. Drift-free projections are detected and no unnecessary writes occur.

## Initial Adoption

When a project already has `serena` or `jetbrains` entries in `opencode.json` or `.mcp.json` that were not created by sync-mcp, the tool will refuse to overwrite them without explicit consent:

```
Error: opencode.json: entry "serena" exists and was not created by sync-mcp.
Use --adopt to take ownership. (conflict)
```

Review the diff first:

```bash
node bin/sync-mcp.mjs --dry-run --adopt
```

Then adopt if the projected values are correct:

```bash
node bin/sync-mcp.mjs --adopt
```

After adoption, subsequent runs do not require `--adopt`.

## Drift Detection

Run `--check` in CI or during setup to detect stale projections:

```bash
node bin/sync-mcp.mjs --check
```

Exit codes:

| Code | Meaning |
|---|---|
| `0` | Projections are up to date |
| `1` | Drift detected or error |

## Symlink Safety

The tool refuses to write to `opencode.json` or `.mcp.json` if either is a symlink, to prevent accidental writes through symlinks to shared configurations.

## Lifecycle

### Adding a new MCP server

1. Add the server entry to `mcp.servers.json`.
2. Run `node bin/sync-mcp.mjs`.
3. Review and commit the updated projections and manifest.

### Changing an existing managed server

1. Edit the entry in `mcp.servers.json`.
2. Run `node bin/sync-mcp.mjs`.
3. Commit the changes.

### Removing a managed server

1. Remove the entry from `mcp.servers.json`.
2. Run `node bin/sync-mcp.mjs`. The entry is removed from both projections.
3. Commit the changes.

### Checking projections in CI

```bash
node bin/sync-mcp.mjs --check
```

This validates that projections match canonical without writing files.

## Relationship to mcp-compose.json

`mcp-compose.json` remains available for non-Serena MCP gateways (JetBrains was previously configured there). Serena is intentionally not in `mcp-compose.json` because it creates persistent shared gateways; Serena must be a per-client on-demand stdio process. The canonical `mcp.servers.json` and its projections now own these configurations directly.
