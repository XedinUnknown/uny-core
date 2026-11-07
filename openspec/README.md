# OpenSpec

This root directory is the tool-skill generation target that populates `.agents/skills/openspec-*/`.
It holds no capability specs.

## Specs

Capability specs live alongside their packages:

- [`packages/di/openspec/`](../packages/di/openspec/README.md): `@uny/di` — composition,
  containers, bootstrap, and errors.
- [`packages/core/openspec/`](../packages/core/openspec/README.md): `@uny/core` — app
  configuration and derived paths.
- [`packages/cli/openspec/`](../packages/cli/openspec/README.md): `@uny/cli` — flags,
  config loading, and inspection.

## Baseline

The initial specs describe the implementation at
[`5c0e1b5`](https://github.com/XedinUnknown/uny-core/tree/5c0e1b5), with later corrections
recorded in [`docs/openspec-baseline-review.md`](../docs/openspec-baseline-review.md), which also
holds historical evidence links, test-coverage notes, and baseline process details.

## Tool Skills

Run `make openspec` (or `make setup`) to regenerate `.agents/skills/openspec-*/` after
updating the `@fission-ai/openspec` dependency or changing tool configuration.
