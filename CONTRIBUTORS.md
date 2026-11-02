# Contributors

This branch contains implemented DI/core foundations and a partial CLI foundation. The instruction runner, persistent hosts, sessions, and device adapters remain planned work.

## Development Setup

This project uses a Docker Compose development container.

The host needs Docker with Compose. Make, Node.js, and pnpm run inside the
development container. After creating `.env` and building the image as described
below, run:

```bash
docker compose run --rm dev make setup
```

Setup creates `.env` from `.env.example` only if absent, installs dependencies
using the frozen lockfile, and installs configured agent integrations. Existing
`.env` values are preserved. Restart OpenCode after installing or refreshing
integrations. Make does not manage images or the Compose lifecycle. The initial
host-side `.env` copy is still needed to configure Compose before the container
can start.

Run these targets inside the container (or through `docker compose run --rm dev make TARGET`):

| Target | Behavior |
|---|---|
| `make setup` (also the default) | Prepare dependencies and agent integrations |
| `make build` | Prepare dependencies and build all packages |
| `make test` | Prepare dependencies and run tests, which build required packages through Nx |
| `make dev` | Prepare dependencies and keep the development environment running |

`build`, `test`, and `dev` share the `dependencies` prerequisite, which installs pinned packages.
They do not install agent integrations. Prerequisites rerun on each Make invocation;
pnpm reuses its cache. A combined `make build test` prepares shared
prerequisites once. `make dev` stays running until interrupted; it starts neither
an application host nor a watcher. The Compose development service runs this
target by default. Start it with `docker compose up -d dev`, then run commands
with `docker compose exec dev make build` or `docker compose exec dev make test`.

The Makefile is not Docker-specific. `make .env` needs only Make and shell
utilities; the package targets also need Node.js and pnpm. CI with those tools
available can run `make build` or `make test` directly without Docker or agent
integration installation. Dependency installation executes package scripts with
write access to the checkout; do not expose secrets to untrusted PR code.

Container provisioning and the underlying package commands remain available below.

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
