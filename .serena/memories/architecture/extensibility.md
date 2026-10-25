# Project Extensibility (`uny.config.js`)

A consuming project extends uny by dropping one file in its root. No uny rebuild.
The provider map **is** the config mechanism — there is no separate config-resolution layer
for extensibility.

## Composition flow (invariant for all future phases)

```
buildBaseProviders()            ordered base map
  → copy into working map       transform must not mutate the base
  → user transform from uny.config.js, if present
  → append 'cli-overrides' LAST flags can never be shadowed
  → required-key guard
  → composeProviders → bootstrap
  → dispatch
```

`cli-overrides` is appended **after** the user transform. This ordering is the reason CLI flags
always win. Do not move it.

## Transform contract

Loader looks for `uny.config.js` then `uny.config.mjs` in the project dir; first match wins;
absent → no-op. Import via a file URL, not a bare path (required for Windows paths and ESM).

Two accepted `export default` shapes:

- **Function** — `(providers: Map<string, Provider>) => Map<string, Provider>`.
  May mutate and return, or return a new Map. Caller uses the return value either way.
- **Plain Provider object** — sugar; loader wraps it as an append transform.

Anything else throws, naming the offending file.

## Ordering is explicit

`Map` insertion order = composition order. Inserting *between* existing providers requires
rebuilding the Map. This is intentional; there is no positioning API and no magic.

## Required-key guard

After the transform, before bootstrap: resolve a known required key (e.g. `app/rootDir`) on a
bare resolver with no cache, no proxy. Existence check only — fast, no side effects.

Failure message must name the likely cause (transform deleted the core provider), not just
report a missing key.

## Delivery modes

Not settled. Candidates:

- **npm install** — global or as a project dependency; the default fit for a Node-ecosystem CLI.
- **Standalone binary** — a packaged single-file executable for environments without Node
  preinstalled.
- **Container image** — bind-mount for dev (mount the project dir, point the process at it via
  an env var; config read live, no rebuild), a derived image for CI (base image with the config
  file copied in), or a compose service in the consuming project. Most relevant when the tool
  needs a matched environment alongside it (e.g. Android tooling).

Whichever mode ships, extensibility is unaffected: the transform loader only needs a project
working directory and a way to point the process at it (env var or CLI flag) — not a specific
delivery mechanism.
