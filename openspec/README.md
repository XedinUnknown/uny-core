# OpenSpec

This root directory provides the tool-skill generation target that populates
`.agents/skills/openspec-*/` and holds the spec for the repository-root entrypoint.

## Specs

This directory:

- [Root entrypoint](specs/root-entrypoint/spec.md): `bin/uny.ts` — bootstrap from core
  and project configuration, placeholder completion behavior.

Capability specs for packages live alongside their packages:

- [`packages/di/openspec/`](../packages/di/openspec/README.md): `@uny/di` — composition,
  containers, bootstrap, and errors.
- [`packages/core/openspec/`](../packages/core/openspec/README.md): `@uny/core` — app
  configuration and derived paths.
- [`packages/cli/openspec/`](../packages/cli/openspec/README.md): `@uny/cli` — flags,
  config loading, and inspection.

## Baseline

The initial specs describe the implementation at
[`5c0e1b5`](https://github.com/XedinUnknown/uny-core/tree/5c0e1b5). Historical evidence
links, test-coverage notes, and baseline process details are in
[`docs/openspec-baseline-review.md`](../docs/openspec-baseline-review.md).

## Tool Skills

Run `make openspec` (or `make setup`) to regenerate `.agents/skills/openspec-*/` after
updating the `@fission-ai/openspec` dependency or changing tool configuration.
