# Contributors

This branch contains implemented DI/core foundations and a partial CLI foundation. The instruction runner, persistent hosts, sessions, and device adapters remain planned work.

## Development Setup

This project uses a Docker Compose development container.

Copy the local environment file first:

```bash
cp .env.example .env
```

Run setup through Docker Compose. The host runs Docker; `pnpm`, Node.js, and agent tooling run inside the container:

```bash
docker compose config
docker compose build dev
docker compose run --rm dev make setup
```

See the [Makefile](Makefile) for development targets. Run them inside the container,
or directly where Make, Node.js, and pnpm are available. Restart OpenCode after
setup installs or refreshes agent integrations.

The project directory is bind-mounted into the container at `WORKDIR`, so files created by container commands are shared with the host development machine. Dependency artifacts such as `node_modules/` remain ignored by Git.

The pnpm store is also bind-mounted from `HOST_PNPM_STORE` to `PNPM_STORE`. By default this points at the host user's pnpm store (`${HOME}/.local/share/pnpm/store`), and the container passes it to pnpm via `npm_config_store_dir`, so package downloads can be reused across projects and dev containers.

Use these lifecycle commands as needed:

```bash
docker compose up -d dev
docker compose logs -f dev
docker compose down
```

## Build and Test

```bash
# Build all packages
pnpm build

# Build only changed packages
pnpm build:changed

# Run all tests (builds first via Nx dependency)
pnpm test

# Run tests for a specific package
cd packages/di && pnpm test
cd packages/core && pnpm test
```

Tests use `node:test` with tsx loader and run against compiled `dist/` output. The build step is automatically triggered by Nx before tests.

## Serena MCP Server

[Serena](https://github.com/oraios/serena) provides semantic code retrieval, editing, and project memories. Claude Code and Codex share an instance pinned to this checkout, managed by [MCP Compose](https://github.com/unsafe9/mcp-compose). OpenCode retains its independent local stdio configuration in `opencode.json` pending integration.

Install [uv](https://docs.astral.sh/uv/) on the host. `uvx` runs Serena directly, so no separate Serena installation is required.

After installing project dependencies, run MCP management on the host (not in the development container), where the clients, IDE, and global memories live. Node.js 22+ and `uvx` must be available:

```bash
sh bin/mcp up
sh bin/mcp status
node bin/mcp-check.mjs
sh bin/mcp logs serena
sh bin/mcp down
```

Always use `sh bin/mcp`, including for shutdown. It supplies an absolute project path and isolates PM2 under `.local/mcp-compose/pm2`; plain MCP Compose commands can otherwise share process management with other projects. The explicit config path also avoids picking up a user-level Compose declaration.

`mcp-compose.json` syncs generated connections only to this checkout's `.mcp.json` (Claude Code) and `.codex/config.toml` (Codex). These machine-specific files and process state are ignored by Git. Approve the project MCP configuration in Claude and trust the project in Codex, then restart those clients. No user-level client configuration is targeted. MCP Compose still keeps its own sync ownership ledger under `~/.mcp-compose`; do not run simultaneous sync commands for different projects.

Serena starts with an explicit project and the single-project `ide` context, which disables project switching. Its upstream revision is pinned in the declaration. Verify `activate_project` is absent if overriding the built-in context locally. Each repository needs its own instance; do not share this endpoint with other projects. Project memories remain in `.serena/memories`; global memories use the existing Serena home and filesystem links (on this machine, `~/.serena/memories/global` resolves to `~/.agents/memories/global`). No separate global-memory server is required. Concurrent edits to the same project or global memory can still overwrite each other and must be coordinated.

MCP Compose `0.7.0` has a pnpm patch to assign unique backend request IDs for shared stdio transports, including newer-protocol servers. Without it, simultaneous clients reusing a request ID can hang. `node bin/mcp-check.mjs` exercises that regression, verifies project switching is absent, reads existing project/global memories, and resolves a TypeScript symbol. After dependency or patch changes, use `down` then `up` to recreate gateway processes with the current installed package.

The JetBrains SSE endpoint is proxied for Codex compatibility; the IDE must serve it at `127.0.0.1:64342`. There is no Docker Compose MCP service. Restart OpenCode after changing its separate configuration.

## AI Tooling

### OpenSpec

OpenSpec is pinned as a root dev dependency (`@fission-ai/openspec`) and installed by
`pnpm install`. See [`openspec/README.md`](openspec/README.md) for an overview of the
per-package structure.

#### Spec locations

Each package owns its capability specs under `packages/<pkg>/openspec/`:

| Package | Specs |
|---|---|
| `@uny/di` | [`packages/di/openspec/`](packages/di/openspec/README.md) |
| `@uny/core` | [`packages/core/openspec/`](packages/core/openspec/README.md) |
| `@uny/cli` | [`packages/cli/openspec/`](packages/cli/openspec/README.md) |

Historical evidence links, test-coverage notes, and baseline process details are in
[`docs/openspec-baseline-review.md`](docs/openspec-baseline-review.md).

#### Validating specs

Validate all packages from the repository root:

```bash
docker compose run --rm -e OPENSPEC_TELEMETRY=0 dev make validate-specs
```

Validate a single package (from its directory, which causes openspec to discover the
package-level `openspec/` rather than the workspace root):

```bash
docker compose run --rm -e OPENSPEC_TELEMETRY=0 dev \
  bash -c 'cd packages/di && ../../node_modules/.bin/openspec validate --all --strict'
```

The `node_modules/.bin/openspec` binary at the repository root resolves correctly when
invoked from any `packages/<pkg>` working directory via the relative `../../` prefix.

#### Agent skill generation

OpenSpec generates shared agent skills into `.agents/skills/openspec-*/` using the
`agents` tool target. These files are excluded from version control and regenerated by
`make setup` (via the `openspec` target). The workspace-root `openspec/` directory holds
tool configuration and the spec for the repository-root entrypoint (`bin/uny.ts`);
package-level capability specs live in each package's own `openspec/` directory.

After upgrading the `@fission-ai/openspec` dependency, run `make setup` again to refresh
the generated skills. Restart OpenCode after setup installs or refreshes integrations.

> **Note:** the `openspec` Makefile target uses `openspec init --tools agents`, not
> `openspec update --tools agents`. The `--tools` flag is only accepted by `init`;
> `update` refreshes previously configured tools without accepting new tool selectors.

### Existing Agent Tooling

Phase 0 AI tooling configuration is included for agent-driven implementation:

- `agents.yaml` declares the config-based modularity skill dependency and the project's [agents-config](https://github.com/XedinUnknown/agents-config) installation settings. Skills are copied into `.agents/skills`, which OpenCode and Codex read directly. The `claude-interop` and `opencode-interop` targets link each skill from the shared `.agents/` directory into the per-harness locations Claude Code and OpenCode expect.
- `agents-lock.json` pins skill and agent sources; generated copies are ignored by Git.
- `.agents/agents/` contains hand-written canonical agent definitions in a portable frontmatter format. agents-config distributes them to each harness through the configured targets.
- `opencode.json` configures OpenCode permissions and Serena MCP. It also declares a `plan` agent permission guard (edit denied). Model selection and the `build` and `code` agent definitions are provided by each client's own configuration, not this file.
- `mcp-compose.json` declares the project-pinned Serena and JetBrains gateways for Claude Code and Codex.

Install configured agent dependencies from the dev container:

```bash
docker compose run --rm dev pnpm exec agents-config install
```

Or directly where `pnpm` and Node.js are available:

```bash
pnpm exec agents-config install
```

Agent dependencies are installed by `make setup`, which runs `agents-config install`.
`install` respects the pinned revisions in `agents-lock.json` and refuses to continue
when the manifest and lock file are inconsistent (the tool reports the mismatch and
exits non-zero so setup fails fast rather than silently installing stale sources).

Use `agents-config update` instead of `install` after changing skill dependency
declarations in `agents.yaml` (adding, removing, or upgrading a skill source) or to
refresh floating locked revisions. `update` resolves and rewrites `agents-lock.json`
to reflect the new declarations, then installs the resolved sources. Commit both
`agents.yaml` and the updated `agents-lock.json` together so that all consumers see a
consistent manifest-and-lock pair. Consumers rerun `make setup` after pulling committed
changes to reinstall from the new lock. Restart OpenCode after setup installs or updates
agent integrations.

## Agent Wiring Tests

`tests/agents.test.js` validates that agent definitions and config wiring are consistent. Run it directly with Node.js (no build step required):

```bash
node --test tests/agents.test.js
```

Or from the dev container:

```bash
docker compose run --rm dev node --test tests/agents.test.js
```
