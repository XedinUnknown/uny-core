# Tech Stack

## Runtime and language

- TypeScript 5.x, **strict**. Root `tsconfig.json`: target ES2022, module ESNext,
  `moduleResolution: bundler`, `noEmit: true` (tsup emits).
- ESM throughout. Every `package.json` has `"type": "module"`.
- Node **>=22**, pnpm **>=10** (`engines`). `packageManager: pnpm@10.12.1`.

## Monorepo

- pnpm workspaces, `packages/*`.
- **Lerna 9** — independent versioning, `lerna run --stream`, `publish from-package`.
- **Nx 23** — build caching only. `targetDefaults`: `build` caches `{projectRoot}/dist` and
  `dependsOn: ["^build"]`; `test` `dependsOn: ["build"]`.
  Consequence: `pnpm test` builds first automatically. Do not add manual build steps to test scripts.
- **tsup** per package, `--format esm --dts`. `@uny/cli` additionally uses `--splitting false`.

## Package surface

Public API is gated by the `exports` field, not by what exists in `src/`.

- `@uny/di` → `.`, `./errors`, `./definitions`. Ships `dist` **and** `src`.
- `@uny/core` → `.` only. Depends on `@uny/di` (`workspace:*`).
- `@uny/cli` → `.`, plus `bin: { uny: ./dist/bin/uny.js }`. Depends on `@uny/core`, `@uny/di`.

## Testing

`node:test` + `node:assert/strict`, run via `node --import tsx --test`.
Tests execute against compiled `dist/` output. `execa` for spawned-process CLI tests.

## Planned (not yet added)

Commander.js (CLI), JSON Schema + ajv (config validation), xml2js or fast-xml-parser
(accessibility tree), webdriverio (`remote()` / `attach()`).

## Deliberate exclusions — do not reintroduce without cause

| Excluded | Reason |
|---|---|
| DI framework (Awilix, Inversify, TSyringe) | impose lifecycle/decorator patterns; `@uny/di` is ~150 lines of explicit, debuggable primitives |
| Cucumber **matcher** | too limited; custom expression engine is the differentiator |
| Zod | JSON Schema validates *and* doubles as documentation, consumable by any tool |
| Cosmiconfig | plain `.e2erc.json` is natively importable; `${ENV}` refs resolved at load |
| Separate env-var config layer | `${ENV}` interpolation inside the JSON file covers it |

Cucumber's *parser* and *message schema* are a separate question from its matcher and are still
open — see `mem:observability`.

## Docker

Multi-stage: `dev` (Node 22 bookworm-slim + corepack) / `builder` / `runtime`.
Runtime image `ghcr.io/xedinunknown/uny-core`, `ENTRYPOINT node /app/packages/cli/dist/bin/uny.js`,
`WORKDIR /project`, `UNY_PROJECT_DIR=/project`.
