# Contributors

This branch contains development setup scaffolding only. Runner implementation packages and CLI behavior are still planned work.

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

These commands currently verify and run the development container only; they do not build the runner yet.

## Serena MCP Server

[Serena](https://github.com/oraios/serena) runs as a separate Docker Compose service using its official image. It provides semantic code retrieval and editing tools to AI agents via MCP.

Start Serena alongside the dev container:

```bash
docker compose up -d serena
```

Serena listens on `http://localhost:9121/sse`. OpenCode is pre-configured to connect to it via `opencode.json`. The web dashboard is available at `http://localhost:24282`.

For other MCP clients (Claude Code, Codex), `mcp-compose` is used on the host to sync `~/.mcp.json`:

```bash
# Install once on host (no sudo needed)
npm config set prefix ~/.npm-global
npm install -g mcp-compose

# Sync after starting Serena
mcp-compose up
```

## AI Tooling

Phase 0 AI tooling configuration is included for agent-driven implementation:

- `agents.yaml` declares the agentdeps-managed config-based modularity skill dependency.
- `.config/agentdeps/config.yaml` configures agentdeps for project-local OpenCode installs.
- `opencode.json` configures OpenCode permissions, `plan`, `build`, and `code` agents, and the Serena MCP server.
- `.agents/` contains agentloom canonical agent definitions.
- `mcp-compose.json` configures `mcp-compose` for non-OpenCode MCP clients (Claude Code, Codex).

Install configured agent dependencies from the dev container:

```bash
docker compose run --rm dev pnpm exec agentdeps install
```
