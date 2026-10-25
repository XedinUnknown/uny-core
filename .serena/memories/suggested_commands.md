# Commands

## Build and test

```bash
pnpm build           # lerna run build --stream
pnpm build:changed   # lerna run build --since --stream
pnpm test            # lerna run test --stream (Nx builds first)
```

Per package:

```bash
cd packages/di && pnpm test
cd packages/core && pnpm test
cd packages/cli && pnpm test
```

Nx `test` `dependsOn: ["build"]`, so a build is triggered automatically. Do not chain one manually.

## Docker Compose dev container

Host runs Docker; pnpm/Node/agent tooling run inside the container.

```bash
cp .env.example .env
docker compose config
docker compose build dev
docker compose run --rm dev pnpm install
docker compose run --rm dev pnpm exec agentdeps install
```

Lifecycle: `docker compose up -d dev`, `docker compose logs -f dev`, `docker compose down`.

Project dir is bind-mounted at `WORKDIR`; files created in the container appear on the host.
pnpm store bind-mounted `HOST_PNPM_STORE` → `PNPM_STORE`, passed to pnpm via
`npm_config_store_dir` so downloads are reused across projects.

Compose services: `dev`, `uny` (runtime image), `serena` (legacy — see below).

## Serena

`mcp-compose.json` is the canonical cross-client Serena configuration. It uses `uvx` to launch
Serena on demand over stdio from the project root; clients need `uv`/`uvx` available on `PATH`.
OpenCode mirrors that local command because it does not read `mcp-compose.json` directly.
The `serena` Docker Compose service is legacy and not used by OpenCode.

```bash
uvx -p 3.13 --from git+https://github.com/oraios/serena serena project index
uvx -p 3.13 --from git+https://github.com/oraios/serena serena memories check
```

Run `serena memories check` after renaming or deleting memories.

## Constraints

Use documented commands only. There is no lint or format command in this repo — do not invent one.
Restart OpenCode after editing `opencode.json`, `.agents/`, or `.opencode/`.
