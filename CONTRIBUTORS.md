# Contributors

This branch contains implemented DI/core foundations and a partial CLI foundation. The instruction runner, persistent hosts, sessions, and device adapters remain planned work.

## Development Setup

This project uses a Docker Compose development container.

The host needs Make and Docker with Compose; Node.js and pnpm run inside the
container. Start a fresh checkout with:

```bash
make setup
```

Setup creates `.env` only if absent, validates Compose configuration, builds the
development image, installs dependencies using the frozen lockfile, and installs
the configured agent integrations. Existing `.env` values are preserved. Restart
OpenCode after setup installs or refreshes agent integrations.

Use these targets for development:

| Target | Behavior |
|---|---|
| `make setup` (also the default) | Prepare dependencies and agent integrations |
| `make build` | Prepare dependencies and build all packages |
| `make test` | Prepare dependencies and run tests, which build required packages through Nx |
| `make dev` | Prepare dependencies and start an idle development container |
| `make down` | Stop the Compose environment without installing or building anything |

`build`, `test`, and `dev` share the `dependencies` prerequisite, which validates
Compose configuration, builds the development image, and installs pinned packages.
They do not install agent integrations. Prerequisites rerun on each Make invocation;
Docker and pnpm reuse their caches. A combined `make build test` prepares shared
prerequisites once. `make dev` starts neither an application host nor a watcher.

Docker-backed build and test targets can run in CI with Docker Compose available.
CI that already provides Node.js and pnpm can continue using the package commands
directly. Dependency installation executes package scripts with write access to the
checkout; do not expose secrets to untrusted PR code.

The equivalent underlying commands remain available below.

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

- `agents.yaml` declares the config-based modularity skill dependency and the project's [agents-config](https://github.com/XedinUnknown/agents-config) installation settings. Skills are copied into `.agents/skills`, which OpenCode reads directly.
- `agents-lock.json` pins skill sources; generated skill copies are ignored by Git.
- `opencode.json` configures OpenCode permissions, `plan`, `build`, and `code` agents, and the Serena MCP server.
- `.agents/` contains agentloom canonical agent definitions.
- `mcp-compose.json` remains available for non-Serena MCP gateways.

Install configured agent dependencies from the dev container:

```bash
docker compose run --rm dev pnpm exec agents-config install
```

The tool is installed directly from the upstream `0.1.x` Git branch, with its resolved commit pinned in `pnpm-lock.yaml`. Use `agents-config update` instead of `install` after changing skill dependency declarations or to refresh their locked revisions. Restart OpenCode after installing or updating skills.
