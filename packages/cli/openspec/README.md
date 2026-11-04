# OpenSpec — @uny/cli

This directory contains the capability specs and validation configuration for the `@uny/cli` package.

## Specs

- [CLI](specs/cli/spec.md): flags, config loading, and inspection.

## Baseline

These specs describe the `@uny/cli` implementation at
[`5c0e1b5`](https://github.com/XedinUnknown/uny-core/tree/5c0e1b5) as living capability
requirements. Plans, memories, and design documents are not requirement sources.

Evidence links, test-coverage notes, and baseline process details are in
[`docs/openspec-baseline-review.md`](../../../docs/openspec-baseline-review.md) at the
repository root.

## Commands

Validate specs for this package via the package script (runs from the workspace root):

```bash
docker compose run --rm -e OPENSPEC_TELEMETRY=0 dev pnpm --filter @uny/cli run spec:validate
```

Or from inside the package directory using the workspace-root binary:

```bash
docker compose run --rm -e OPENSPEC_TELEMETRY=0 dev \
  bash -c 'cd packages/cli && ../../node_modules/.bin/openspec validate --all --strict'
```

Or validate all packages at once from the repository root via the Makefile:

```bash
docker compose run --rm -e OPENSPEC_TELEMETRY=0 dev make validate-specs
```
