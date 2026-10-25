# uny — Core

## What it is

Natural-language instruction runner over a **persistent connection to a controllable subject**.
Mobile app testing (Appium/WDIO) is the first instruction set, not the definition of the product.

Defining property: the subject connection survives across separate process invocations.
Attach to live session ≈ <1s vs ≈30s+ cold start. This is what makes interactive and
agent-driven exploration viable, and it is the reason the tool exists.

Concretely: pipe natural-language instructions into a binary and it drives a subject —
a mobile app today, a game tomorrow (see `mem:architecture/instruction-sets`). The "subject"
is deliberately abstract; anything with a controllable target and observable state qualifies.

Not a suite runner. Executes individual instructions; suites are a special case.

Consumers: developers debugging flows, CI running feature files, AI agents driving the subject.
Stdin mode and structured output exist specifically for the third.

## Organizing principle

Config-based modularity (Ukhanev "Cross-Platform Modularity in PHP" / Dhii lineage).
Building blocks are **packages** and **providers**. Avoid the word "module" except for ES modules.
See `mem:architecture/composition` for the primitives, override/extension semantics, and the
actual bootstrap container chain.

## Packages

- `@uny/di` — composition primitives. Barrel-only `src/index.ts`. No framework dependency.
- `@uny/core` — `coreProvider(AppConfig)`; defines `app/*` keys (name, version, rootDir,
  derived paths, environment).
- `@uny/cli` — partial executable/configuration/inspection foundation. It is intended to evolve
  into the thin client and host entrypoints; the persistent application host owns full runtime composition.

## Status

`README.md`, `CONTRIBUTORS.md`, `.opencode/plans/architecture.md`, and
`.opencode/plans/implementation-plan.md` describe the current prototype and intended direction.

Implemented and tested prototypes: `@uny/di`, `@uny/core`, and the initial `@uny/cli`
inspect/config path. The DI prototype remains under design review; `packages/di/README.md` is the
intended contract to reconcile before WORK-2 is accepted. Not implemented: persistent hosts,
sessions, device/target adapters, instruction runner, parser, screen support, and logging.

## Plan documents

`.opencode/plans/architecture.md` is the normative design, and
`.opencode/plans/implementation-plan.md` is the delivery/status source of truth. Accepted planning
intent governs components still under design; existing code is reconciled before a ticket is accepted.

## Cross-project context

For the global project catalog on this machine, see `mem:global/projects`.

## References

- `mem:architecture/composition` — six primitives, override vs extension, bootstrap chain,
  plan-vs-code divergence on provenance.
- `mem:architecture/keys` — key namespace as application semantics; which namespaces are
  generic slots vs mobile-specific instances.
- `mem:architecture/instruction-sets` — core vs instruction set vs target adapter boundary;
  how a new domain (e.g. a game) is added without core changes.
- `mem:architecture/extensibility` — `uny.config.js` transform contract, CLI override ordering,
  required-key guard.
- `mem:observability` — sink model, NDJSON field profile and why tool/standard compatibility
  is a requirement, open Cucumber Messages question.
- `mem:tech_stack` — stack, version pins, and deliberate exclusions with reasons.
- `mem:conventions` — code style, test strategy, invariants that are easy to violate.
- `mem:suggested_commands` — build, test, Docker Compose setup, Serena upkeep.
- `mem:task_completion` — what to run before calling work done.
