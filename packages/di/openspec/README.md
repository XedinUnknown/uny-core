# OpenSpec — @uny/di

This directory contains the capability specs and validation configuration for the `@uny/di` package.

## Specs

- [DI composition](specs/composition/spec.md): providers, definition helpers, and provenance.
- [DI containers](specs/containers/spec.md): resolution, decorators, bootstrap, caching, and errors.

## Baseline

These specs describe the `@uny/di` implementation at
[`5c0e1b5`](https://github.com/XedinUnknown/uny-core/tree/5c0e1b5) as living capability
requirements. Plans, memories, and design documents are not requirement sources.

Evidence links, test-coverage notes, and baseline process details are in
[`docs/openspec-baseline-review.md`](../../../docs/openspec-baseline-review.md) at the
repository root.

## Commands

Validate specs for this package (run from this package directory):

```bash
docker compose run --rm -e OPENSPEC_TELEMETRY=0 dev \
  bash -c 'cd packages/di && node_modules/.bin/openspec validate --all --strict'
```

Or from the repository root via the Makefile:

```bash
make validate-specs
```
