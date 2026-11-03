# OpenSpec — @uny/core

This directory contains the capability specs and validation configuration for the `@uny/core` package.

## Specs

- [Core configuration](specs/configuration/spec.md): app keys and derived paths.

## Baseline

These specs describe the `@uny/core` implementation at
[`5c0e1b5`](https://github.com/XedinUnknown/uny-core/tree/5c0e1b5) as living capability
requirements. Plans, memories, and design documents are not requirement sources.

Evidence links, test-coverage notes, and baseline process details are in
[`docs/openspec-baseline-review.md`](../../../docs/openspec-baseline-review.md) at the
repository root.

## Commands

Validate specs for this package (run from this package directory):

```bash
docker compose run --rm -e OPENSPEC_TELEMETRY=0 dev \
  bash -c 'cd packages/core && node_modules/.bin/openspec validate --all --strict'
```

Or from the repository root via the Makefile:

```bash
make validate-specs
```
