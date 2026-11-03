# OpenSpec

This directory contains the capability specs and validation configuration for the `uny` project.

## Design

[`design/`](design/) holds supplementary project planning documents: the normative architecture and the
delivery implementation plan. These are project conventions, not OpenSpec-validated artifacts, and do not
expand the OpenSpec baseline. No planned or future runtime behavior is claimed as implemented here.

## Specs

- [DI composition](specs/di-composition/spec.md): providers, definition helpers, and provenance.
- [DI containers](specs/di-containers/spec.md): resolution, decorators, bootstrap, caching, and
  errors.
- [Core configuration](specs/core-config/spec.md): app keys and derived paths.
- [CLI](specs/cli/spec.md): flags, config loading, inspection, and the distinct root executable
  skeleton.

## Baseline

The initial specs describe behavior at
[`5c0e1b5`](https://github.com/XedinUnknown/uny-core/tree/5c0e1b5). They record what exists as
living capability requirements, not a snapshot of the implementation. Plans, memories, and design
documents are not requirement sources. No instruction runner, persistent host, session lifecycle, or
device adapter is specified.

Evidence links, test-coverage notes, historical quirks, and baseline process details are in
[baseline-review.md](baseline-review.md).
