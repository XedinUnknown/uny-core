# AGENTS

Read `README.md` first. It is the shared source for project status and human-facing guidance. Read `CONTRIBUTORS.md` for development setup commands and AI tooling notes.

Agent-only notes:

- Inspect `.opencode/plans/` before creating or changing project files; the current plan is the source of truth until implementation begins.
- Treat runner implementation as not started; current `0.1.x` work is development setup scaffolding only.
- Use the documented Docker Compose setup commands only; do not infer missing test, lint, or runner commands.
- Keep documentation and scaffolding changes minimal unless explicitly requested.
- Do not start implementation phases from the plan unless explicitly asked.
- When implementation does begin, preserve the plan's test-first requirement and config-based modularity constraints.
- Use the `Dhii/containers` `0.3.x` config-based modularity skill as the canonical source when available.
- Restart OpenCode after changes to `opencode.json`, `.agents/`, or `.opencode/` files.
- Serena MCP is available when `docker compose up -d serena` is running; OpenCode connects to it at `http://localhost:9121/sse`.
- `mcp-compose.json` is for non-OpenCode clients only (Claude Code, Codex); do not edit `opencode.json` to match it.
- `mcp_compose.toml` has been replaced by `mcp-compose.json`; do not recreate the TOML file.

## Package Structure

### `@uny/di`

DI library with barrel-based source structure:

- `src/index.ts` — barrel re-exports only
- `src/types.ts` — Definition, Extension, Provider, Container, KeyInspection
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

## Testing

- `node:test` + `node:assert/strict` with tsx loader
- Tests run against compiled `dist/` output (package `exports` field enforced)
- Build triggered automatically by Nx before tests
- PhpStorm limitation: `assert.strictEqual` shows as unresolved (CJS namespace merge pattern). Tests pass at runtime.
