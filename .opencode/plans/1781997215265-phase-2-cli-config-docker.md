# Phase 2 — CLI + Docker-Runnable Image with Transform-Hook Extensibility

**Author**: plan agent
**Date**: 2026-06-21
**Depends on**: Phase 1 (`@uny/di`, `@uny/core`) — complete, 44 tests passing.

---

## Goal

Ship a **runnable `uny` binary** that:

1. Boots the provider composition with a minimal base map.
2. Lets any project **extend or override the provider map** by dropping a single `uny.config.js` in their project root — no Uny rebuild.
3. Runs from a **published Docker image** (`ghcr.io/xedinunknown/uny-core`) — a project bind-mounts its dir or derives `FROM uny:latest`.

There is no separate config resolution layer. The provider map **is** the config mechanism. A project's `uny.config.js` adds providers that define whatever keys they need — same as any other provider. CLI flag overrides are a provider appended last.

---

## Composition flow (the invariant for all future phases)

```
base provider map (ordered, from providers.ts)
  → apply user transform from uny.config.js if present
  → append 'cli-overrides' provider LAST (flags always win)
  → required-key guard
  → composeProviders(map)
  → bootstrap(composed)
```

Every future phase adds providers to `providers.ts`. The user transform sees them all and can insert, replace, reorder, or delete. CLI overrides are always appended after the transform so flags can never be shadowed by user config.

---

## New package: `@uny/cli`

### Package shape

```
packages/cli/
  package.json          @uny/cli, "bin": { "uny": "./dist/bin/uny.js" }, type:module
  tsconfig.json         NodeNext, extends ../../tsconfig.json
  src/
    bin/uny.ts          #!/usr/bin/env node — only calls main(process.argv)
    main.ts             parse flags → build map → load transform → append overrides
                        → guard → bootstrap → dispatch command
    flags.ts            parseFlags(argv) → Flags
    providers.ts        buildBaseProviders() → ordered Map<string,Provider>
    loader.ts           loadTransform(projectDir) → transform fn | null
    commands/
      inspect.ts        resolves all keys, prints key → definedBy table
  tests/
    loader.test.ts
    cli.inspect.test.ts
```

### `bin/uny.ts`

Shebang + one line. Never grows.

```ts
#!/usr/bin/env node
import { main } from "../main.js";
main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
```

### `flags.ts`

```ts
// parseFlags(argv: string[]): Flags
//
// --project-dir <path>   default: process.env.UNY_PROJECT_DIR ?? process.cwd()
// -v                     repeatable, increments verbosity
// -q                     repeatable, decrements verbosity
// --format human|json    default: human
// --help                 print usage and exit 0
//
// First non-flag word = command name (default: 'inspect' for this phase)
//
// Returns plain object. No Commander dep yet — add it when commands multiply.
// NUANCE: -vvv is three separate -v flags in argv; parseFlags folds them into a count.
```

### `providers.ts`

```ts
// buildBaseProviders(): Map<string, Provider>
//
// Returns the ordered base map that every run starts from.
// Order matters — later providers override earlier ones for the same key.
//
// For phase 2:
//   'core' → coreProvider({ name, version, rootDir }) from @uny/core
//
// Future phases append here: 'session', 'device-android', 'logging', etc.
// The user transform in uny.config.js sees this map and may insert between them.
//
// NUANCE: appConfig passed to coreProvider is read from package.json at startup
// (name, version) and process.cwd() / UNY_PROJECT_DIR (rootDir). This is the
// only place process.env is read for structural config — everything else is a key.
```

### `loader.ts`

```ts
// loadTransform(projectDir: string): Promise<Transform | null>
//
// type Transform = (providers: Map<string, Provider>) => Map<string, Provider>
//
// 1. Look for uny.config.js then uny.config.mjs in projectDir. First match wins.
//    If neither exists, return null (no-op).
//
// 2. dynamic import(pathToFileURL(absPath).href)
//    NUANCE: must use pathToFileURL so Windows paths work and Node treats it as ESM.
//
// 3. Read mod.default. Two accepted shapes:
//    a. Function → use directly as transform.
//    b. Plain Provider object → wrap: (providers) => providers.set('user', mod.default)
//       Sugar for "just add my provider" without writing a function.
//    Anything else → throw with a clear message naming the file.
//
// 4. Caller passes a NEW Map (copy of base) so the transform mutates a fresh copy.
//    Original base map is never touched. Safe for testing.
```

### `main.ts`

```ts
// main(argv: string[]): Promise<void>
//
// 1. flags = parseFlags(argv)
//    if flags.help → print usage, exit 0
//
// 2. baseMap = buildBaseProviders()
//
// 3. workingMap = new Map(baseMap)  // copy — transform mutates this
//
// 4. transform = await loadTransform(flags.projectDir)
//    if transform: workingMap = transform(workingMap)
//    NUANCE: transform may return a brand-new Map or mutate+return the same one.
//    Both work because we assign the return value.
//
// 5. Append 'cli-overrides' to workingMap AFTER transform:
//    definitions:
//      'io/verbosity':  () => flags.verbose - flags.quiet
//      'output/format': () => flags.format
//    NUANCE: appended last so CLI flags always win over user transform output.
//    More keys added here in future phases (device/app-id, session flags, etc.)
//
// 6. requiredKeyGuard(workingMap)
//    Resolves 'app/rootDir' on a bare DelegatingContainer (no caching, no proxy).
//    If it throws MissingKeyError, emit a clear message and exit 1:
//      "required key 'app/rootDir' missing — did uny.config.js remove the 'core' provider?"
//    NUANCE: checks key existence only, not value. Fast, no side effects.
//
// 7. container = bootstrap(workingMap)
//
// 8. dispatch(flags.command, container, flags)
//    'inspect' → commands/inspect.ts
//    unknown   → "unknown command: <x>", exit 1
```

### `commands/inspect.ts`

```ts
// inspectCommand(container: Container, flags: Flags): void
//
// Calls container.keys() and for each key calls container.inspect(key).
// Prints a table: KEY | DEFINED-BY | EXTENDED-BY
//
// --format json → JSON array of KeyInspection objects
// --format human → aligned text table
//
// Purpose: proves the whole composition chain is visible and diagnosable.
// This is the "hello world" of the architecture — if inspect works, bootstrap works.
//
// NUANCE: 'inspect' with a key argument → detailed view of one key
//   uny inspect device/app-id
//   shows: definedBy, extendedBy, resolved, cached
```

---

## Tests (test-first order)

### 1. `loader.test.ts` (functional — write first)

Uses fixture files in `tests/fixtures/`:

```
fixtures/
  has-transform/
    uny.config.js   export default (providers) => { providers.set('extra', extraProvider); return providers; }
  plain-provider/
    uny.config.js   export default { definitions: { 'test/key': () => 'value' } }
  no-config/        (empty dir)
  bad-export/
    uny.config.js   export default 42
  positioning/
    uny.config.js   inserts a provider between 'core' and any future provider

describe loadTransform:
  returns null when no uny.config.js present
  loads function export and returns it
  wraps plain Provider export into append-transform
  throws clearly when export shape is invalid
  transform receives a copy — original base map unchanged after transform
  transform return value is used (not the original map reference)
  transform can insert a provider at a specific position (Map order preserved)
```

### 2. `cli.inspect.test.ts` (E2E spawned-process — write second)

```ts
// Spawns the compiled uny binary. Requires pnpm build (Nx dependsOn ensures this).

describe 'uny inspect':
  exits 0 and prints key table when no uny.config.js
  --format json outputs valid JSON array of KeyInspection objects
  shows 'core' provider keys in output
  uny.config.js transform adds extra keys visible in inspect output
  uny inspect app/rootDir shows definedBy: 'core'
  --help exits 0 and prints usage
  unknown command exits 1 with clear message
```

---

## Docker

### Multistage Dockerfile (extends existing `dev` target)

```dockerfile
# existing dev target — unchanged
FROM node:22-bookworm-slim AS dev
WORKDIR /workspace
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
CMD ["pnpm", "--version"]

# builder: install + compile all packages
FROM node:22-bookworm-slim AS builder
WORKDIR /build
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# runtime: minimal image with prod deps only
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/package.json /build/pnpm-lock.yaml /build/pnpm-workspace.yaml ./
COPY --from=builder /build/packages ./packages
RUN pnpm install --frozen-lockfile --prod
ENV UNY_PROJECT_DIR=/project
WORKDIR /project
ENTRYPOINT ["node", "/app/packages/cli/dist/bin/uny.js"]
CMD ["--help"]
```

### docker-compose.yml — add `uny` service

```yaml
  uny:
    build: { context: ., target: runtime }
    image: ghcr.io/xedinunknown/uny-core:latest
    volumes:
      - .:/project
    environment:
      UNY_PROJECT_DIR: /project
```

### `.github/workflows/image.yml`

```yaml
# Trigger: push to main or version tag (v*.*.*).
# Build --target runtime, push to ghcr.io/xedinunknown/uny-core.
# Tags: :latest on main, :v<tag> on version tags.
# Auth: GITHUB_TOKEN (ghcr) — no new secrets needed.
# Cache: docker/build-push-action with cache-from=type=gha.
```

---

## Delivery modes for user projects

### Mode 1 — bind-mount (dev)

```bash
docker run --rm \
  -v "$PWD":/project \
  -e UNY_PROJECT_DIR=/project \
  ghcr.io/xedinunknown/uny-core:latest inspect
```

`uny.config.js` read live. Edit → re-run, no rebuild.
If it imports npm packages, also mount `node_modules`:
```bash
  -v "$PWD/node_modules":/project/node_modules
```

### Mode 2 — derived image (CI / reproducible)

```dockerfile
FROM ghcr.io/xedinunknown/uny-core:latest
COPY uny.config.js /project/
ENV UNY_PROJECT_DIR=/project
```

### Mode 3 — compose service in project

```yaml
services:
  uny:
    image: ghcr.io/xedinunknown/uny-core:latest
    volumes:
      - .:/project
    environment:
      UNY_PROJECT_DIR: /project
```

---

## `uny.config.js` contract

```js
// Shape A: transform function (full control, preferred)
export default (providers) => {
  // providers is a copy of the ordered base Map. Mutate freely or return new Map.
  // Append:
  providers.set('acme', { definitions: { 'device/app-id': () => 'com.acme' } });
  // Insert between existing providers (rebuild Map to control order):
  // const next = new Map();
  // for (const [k, v] of providers) {
  //   next.set(k, v);
  //   if (k === 'core') next.set('acme/overrides', overrideProvider);
  // }
  // return next;
  return providers;
};

// Shape B: plain Provider object (sugar — loader wraps into append-transform)
export default {
  definitions: { 'device/app-id': () => 'com.acme' },
};
```

NUANCE on positioning: `Map` preserves insertion order = composition order. Inserting between two providers requires rebuilding the Map. This is intentional — explicit, no magic.

---

## Required-key guard

After user transform, before `bootstrap`, resolve `app/rootDir` on a bare `DelegatingContainer(composeProviders(workingMap))` — no caching, no proxy. If `MissingKeyError`:

```
Error: required key 'app/rootDir' is missing after uny.config.js transform.
Did your transform accidentally delete the 'core' provider?
```

Quick existence check only. Does not validate values, does not run full bootstrap.

---

## Definition of done

- [ ] `pnpm test` passes: `loader` and `cli.inspect` green
- [ ] `uny inspect` prints key table showing `core` provider keys
- [ ] `uny.config.js` transform adds keys visible in `uny inspect` output
- [ ] `docker build --target runtime` succeeds
- [ ] `docker run ghcr.io/xedinunknown/uny-core:latest --help` exits 0
- [ ] Bind-mounted `uny.config.js` changes `uny inspect` output without image rebuild
- [ ] Image published on tag push via `image.yml`

---

## What this phase does NOT include

- Config file loading (`.e2erc.json`) — just a provider, add when needed
- JSON Schema / ajv validation
- Session, lock, reset (Phase 4)
- Device adapters (Phase 5)
- Logging / output formatter (Phase 3)
- Step parsing / runner (Phase 7)
- Commander.js — hand-rolled flags until commands multiply
