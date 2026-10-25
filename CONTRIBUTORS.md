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
docker compose run --rm dev pnpm install
docker compose run --rm dev pnpm --version
```

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

[Serena](https://github.com/oraios/serena) provides semantic code retrieval and editing tools to AI agents via MCP. Each client starts it directly as an on-demand local stdio process via `uvx` — no Docker container and no persistent shared server.

Install [uv](https://docs.astral.sh/uv/) on the host. `uvx` runs Serena directly, so no separate Serena installation is required.

OpenCode is configured in `opencode.json`. Restart OpenCode after changing that configuration. Other clients should use their own local stdio MCP configuration with this command and arguments:

```text
$HOME/.local/bin/uvx -p 3.13 --from git+https://github.com/oraios/serena serena start-mcp-server --context=ide --open-web-dashboard=false --project-from-cwd
```

There is no `serena` Docker Compose service in this project. `mcp-compose` is not used for Serena because it creates persistent shared gateways. A shared/background Serena server risks stale or cross-session state (a different client can silently switch its active project or write to a location this project doesn't control).

## AI Tooling

Phase 0 AI tooling configuration is included for agent-driven implementation:

- `agents.yaml` declares the agentdeps-managed config-based modularity skill dependency.
- `.config/agentdeps/config.yaml` configures agentdeps for project-local OpenCode installs.
- `opencode.json` configures OpenCode permissions, `plan`, `build`, and `code` agents, and the Serena MCP server.
- `.agents/` contains agentloom canonical agent definitions.
- `mcp-compose.json` remains available for non-Serena MCP gateways.

Install configured agent dependencies from the dev container:

```bash
docker compose run --rm dev pnpm exec agentdeps install
```
