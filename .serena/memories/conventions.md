# Conventions

## Vocabulary

Building blocks are **packages** and **providers**. Do not use "module" for anything except
ES/CommonJS modules. Provider = a set of keyed definitions and extensions.

## Authoring providers

Providers live one per file and export a plain `Provider` object (or a factory returning one).
No classes, no lifecycle methods. A package's public composition entrypoint should be a thin
barrel of re-exports, not a place where logic accumulates.

## Binding invariants — see, don't restate

Lazy definitions, immutable composition, external-only cross-cutting concerns, never formatting
at the call site, output routing, and preferring dependency-declaring definition helpers are
stated once, with rationale, in `mem:architecture/composition` and `mem:observability`. Key
namespacing rules are in `mem:architecture/keys`. This memory does not repeat them.

## Testing

**Test-first.** Applies to: composition behaviour, config resolution, session lifecycle and
recovery, parsing and step matching, screen/interaction resolution, lock and reset, CLI with
mocked boundaries.

Skip TDD only for mechanical scaffolding already covered elsewhere (workspace boilerplate,
build-tool wiring, trivial manifests).

**Feature-test rule.** Every feature starts with at least one *functional* test before
implementation. Preference order:

1. E2E CLI test via spawned process — when the feature is user-visible
2. functional/integration test — minimum when full E2E is too heavy for the first slice
3. unit tests — beneath those, for primitives and edge cases

Never introduce a user-visible feature with unit tests only.

Examples: new flag → spawned-process CLI test. New config behaviour → functional config-loading
test. New step syntax → sentence-resolution test plus a real CLI invocation proving the parse path.

**CLI tests** assert exit code, stdout, stderr, stdin piping, env effects, file outputs via a
spawned process. Bash only as a thin human convenience wrapper — assertions stay in the test
runner so failures are structured and CI-friendly.

A package's public surface is whatever it explicitly exports. Tests should exercise that public
surface, not internal paths, so the export gate is never silently bypassed.

Never import a package by its own name from inside that package (self-import breaks resolution);
use a relative path.

## Definition of done for a slice

Failing feature-facing test → implementation passes → supporting unit tests where they buy
speed or edge coverage. No feature is done without functional proof.
