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
| `opencode.json` | OpenCode | `type:"local"` for stdio, `type:"remote"` for SSE; `${VAR}` → `{env:VAR}` |
| `.mcp.json` | Claude / MCP clients | `type:"stdio"` for stdio, `type:"sse"` for SSE; `${VAR}` kept as-is |

Both projection files are committed. `mcp.servers.json` owns the authoritative configuration for the `serena` and `jetbrains` servers.

## Canonical Format

`mcp.servers.json` uses a portable format with `${VAR}` variable references (not expanded at generation time):

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
| `stdio` | `command` (string), `args` (string[]) | `env` (string values) |
| `sse` | `url` (string) | `headers` (string values) |

Unknown keys are rejected. Server names `__proto__`, `constructor`, and `prototype` are reserved.

### Variable references

Use `${VAR}` anywhere in `command`, `args`, `env` values, `url`, or `headers`. The projection tool translates `${VAR}` to `{env:VAR}` in OpenCode output and leaves it unchanged in Claude output. Variables are never expanded at generation time.

`${VAR:-default}` syntax is not supported and is rejected at validation time.

### Projection shapes

**OpenCode (`opencode.json` `mcp` section):**

```json
"serena": {
  "type": "local",
  "command": ["{env:HOME}/.local/bin/uvx", "-p", "3.13", "..."],
  "environment": { "BROWSER": "/bin/true" }
},
"jetbrains": {
  "type": "remote",
  "url": "http://127.0.0.1:64342/sse"
}
```

**Claude (`.mcp.json` `mcpServers` section):**

```json
"serena": {
  "type": "stdio",
  "command": "${HOME}/.local/bin/uvx",
  "args": ["-p", "3.13", "..."],
  "env": { "BROWSER": "/bin/true" }
},
"jetbrains": {
  "type": "sse",
  "url": "http://127.0.0.1:64342/sse"
}
```

## Managed Servers

The canonical file owns exactly the servers declared in `mcp.servers.json`. Currently managed:

- **`serena`** — [Serena](https://github.com/oraios/serena) semantic code tools via stdio. Launched per-client on demand using `uvx`; no shared/background process. The full path `${HOME}/.local/bin/uvx` avoids PATH manipulation.
- **`jetbrains`** — JetBrains IDE MCP gateway via SSE at `http://127.0.0.1:64342/sse`.

All other entries in `opencode.json` and `.mcp.json` are unmanaged and are left untouched by sync-mcp.

## Projection Tool

### Usage

```bash
# Generate projections from mcp.servers.json (idempotent; no writes when unchanged)
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

Run tooling tests:

```bash
node --test tests/mcp.test.mjs
```

Or via the package script:

```bash
pnpm run test:tooling
```

### Flags

| Flag | Description |
|---|---|
| `--check` | Validate projections match canonical. Exits 1 if any drift is detected. |
| `--dry-run` | Print the projected content; do not write any files. |
| `--root <dir>` | Project root directory (default: `process.cwd()`). |
| `--adopt` | Allow overwriting entries that were not created by sync-mcp, or that were externally modified since last sync. Required only on first-time migration or when accepting external edits. |

### No dependencies

`bin/sync-mcp.mjs` uses only Node.js built-in modules. No `node_modules` installation is required to run it.

## Ownership and the Manifest

Ownership state is tracked in `.mcp.manifest.json`. It records:

- **`managed`** — sorted list of server names owned by sync-mcp.
- **`snapshots`** — the projected value last written for each managed entry, keyed as `oc:<name>` and `cl:<name>`.

On each run:

- Managed entries are updated to reflect the current canonical.
- An entry not in the manifest is left untouched unless `--adopt` is given.
- A managed entry whose current value in a projection file differs from the stored snapshot is treated as externally modified; sync-mcp refuses to overwrite it without `--adopt`.
- Managed entries removed from `mcp.servers.json` are removed from both projection files.
- Unmanaged entries are never removed.

`.mcp.manifest.json` is committed alongside the projection files.

## Idempotence

Running `node bin/sync-mcp.mjs` multiple times produces identical output. Files are only written when their content would change.

## Initial Adoption

When a project already has `serena` or `jetbrains` entries in `opencode.json` or `.mcp.json` that were not created by sync-mcp, the tool refuses to overwrite them without explicit consent:

```
Error: opencode.json: "serena" exists and is not managed by sync-mcp; use --adopt
```

Review the projected changes first:

```bash
node bin/sync-mcp.mjs --dry-run --adopt
```

Then adopt if the projected values are correct:

```bash
node bin/sync-mcp.mjs --adopt
```

After adoption, subsequent runs require `--adopt` only if an entry is externally modified.

## External-Edit Protection

After initial generation, any edit to a managed entry directly in `opencode.json` or `.mcp.json` will be detected and rejected on the next run:

```
Error: opencode.json: "serena" was externally modified since last sync; use --adopt to overwrite
```

To accept the canonical value (discarding the external edit), run with `--adopt`. To keep the external value, update `mcp.servers.json` instead and re-run without `--adopt`.

## Drift Detection

```bash
node bin/sync-mcp.mjs --check
```

Exit codes: `0` = up to date, `1` = drift or error.

## Symlink Safety

The tool refuses to write to `opencode.json` or `.mcp.json` if either is a symlink, to prevent accidental writes through symlinks to shared configurations.

## Lifecycle

### Adding a new MCP server

1. Add the server entry to `mcp.servers.json`.
2. Run `node bin/sync-mcp.mjs`.
3. Commit the updated projections and manifest.

### Changing an existing managed server

1. Edit the entry in `mcp.servers.json`.
2. Run `node bin/sync-mcp.mjs`.
3. Commit the changes.

### Removing a managed server

1. Remove the entry from `mcp.servers.json`.
2. Run `node bin/sync-mcp.mjs`. The entry is removed from both projections.
3. Commit the changes.

## Relationship to mcp-compose.json

`mcp-compose.json` remains available for non-Serena MCP gateways. Serena is intentionally not in `mcp-compose.json` because it creates persistent shared gateways; Serena must be a per-client on-demand stdio process. `mcp.servers.json` and its projections now own both managed server configurations directly.
