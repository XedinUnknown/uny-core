# AGENTS

Read `README.md` first. It is the shared source for project status and human-facing guidance. Read `CONTRIBUTORS.md` for development setup commands and AI tooling notes.

Agent-only notes:

- Read `.opencode/plans/architecture.md` and `.opencode/plans/implementation-plan.md` before creating or changing project files; they are the design and delivery sources of truth until implementation supersedes planned behavior.
- Treat the instruction runner, persistent hosts, sessions, and device adapters as not started. DI/core and the initial CLI/config/inspect foundation already exist.
- Use the documented Docker Compose setup commands only; do not infer missing test, lint, or runner commands.
- Keep documentation and scaffolding changes minimal unless explicitly requested.
- Do not start implementation phases from the plan unless explicitly asked.
- When implementation does begin, preserve the plan's test-first requirement and config-based modularity constraints.
- Use the `Dhii/containers` `0.3.x` config-based modularity skill as the canonical source when available.
- Restart OpenCode after changes to `opencode.json`, `.agents/`, or `.opencode/` files.
- Claude Code, Codex, and OpenCode connect to the project facade started by `sh bin/mcp` (Datalayer Python `mcp-compose==0.1.13`, foreground process). All use the same project-pinned Serena; client configurations are explicit, not generated.
- Serena MCP calls should go through the MCP tool interface, not the `serena` CLI, so results reflect the actual connected server rather than a separately-invoked process that may target a different data directory.
- `mcp_compose.toml` declares the Serena and JetBrains servers; `.mcp.json`, `.codex/config.toml`, and `opencode.json` are committed and each point to the single `uny` endpoint. Serena must start with this checkout's absolute project path and project switching disabled; do not turn it into a multi-project shared server. Shared project/global memory edits still need coordination to avoid lost updates. There is no Docker Compose `serena` service.

## Package Structure

### `@uny/di`

DI library with barrel-based source structure:

- `README.md` — intended DI contract under design review; implementation must be reconciled before WORK-2 is accepted
- `src/index.ts` — barrel re-exports only
- `src/types.ts` — Definition, Extension, Provider, Container, and current provenance types
- `src/compose.ts` — composeProviders()
- `src/containers.ts` — DelegatingContainer, CachingContainer, ProxyContainer, CompositeContainer
- `src/circular.ts` — CircularDetector
- `src/bootstrap.ts` — bootstrap()
- `src/definitions.ts` — factory(), value(), alias(), construct()
- `src/errors.ts` — DependencyError, MissingKeyError, CircularDependencyError

Exports: `@uny/di`, `@uny/di/errors`, `@uny/di/definitions`

### `@uny/core`

Core app module providing basic paths and config.

- `src/index.ts` — coreProvider with app config and derived paths

### `@uny/cli`

Partial executable and project-configuration foundation:

- `src/bin/uny.ts` — package binary entrypoint
- `src/main.ts` — bootstrap and command dispatch
- `src/flags.ts` — current hand-written option parser
- `src/providers.ts` — base provider map
- `src/loader.ts` — `uny.config.js`/`uny.config.mjs` provider loading
- `src/commands/inspect.ts` — human and JSON composition inspection

## Testing

- `node:test` + `node:assert/strict` with tsx loader
- Tests run against compiled `dist/` output (package `exports` field enforced)
- Build triggered automatically by Nx before tests
- PhpStorm limitation: `assert.strictEqual` shows as unresolved (CJS namespace merge pattern). Tests pass at runtime.
