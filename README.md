# uny

uny is an exploration-first natural-language instruction runner. Mobile app testing through Appium and WebDriverIO is its first target.

Unlike a traditional suite runner, it is intended to run individual commands against a real mobile device while preserving the automation session between invocations. The goal is fast interactive and AI-assisted exploration through commands such as `uny run`, stdin input, feature files, tree inspection, screenshots, and reset/session controls.

## Status

This branch contains the `@uny/di` and `@uny/core` foundations plus a partial `@uny/cli` with configuration loading and `inspect`. The instruction runner, persistent hosts, sessions, and device adapters remain planned work.

See `CONTRIBUTORS.md` for development setup notes.
See `.opencode/plans/architecture.md` and `.opencode/plans/implementation-plan.md` for the current design and delivery status.

## Capability Specs

OpenSpec capability specs are co-located with their subjects:

- [`openspec/`](openspec/README.md) — repository-root entrypoint (`bin/uny.ts`).
- [`packages/di/openspec/`](packages/di/openspec/README.md) — `@uny/di` composition and containers.
- [`packages/core/openspec/`](packages/core/openspec/README.md) — `@uny/core` app configuration.
- [`packages/cli/openspec/`](packages/cli/openspec/README.md) — `@uny/cli` command-line interface.

## Planned Design

The runner is planned around config-based modularity:

- Providers contribute keyed lazy definitions and extensions.
- A persistent application host owns provider selection, ordering, composition, and runtime bridging; normal CLI invocations are short-lived clients.
- Later definitions override earlier ones; extensions layer in deterministic order.
- A single immutable composed container is the source of truth.
- Platform concerns such as Appium, WebDriverIO, ADB, Docker, files, and CLI input are adapted by the host into keys.

## Planned Capabilities

- Named persistent hosts and WebDriverIO/Appium sessions for fast repeated commands and multiple devices.
- Gherkin and raw command parsing with a custom expression matcher.
- Multi-strategy element discovery for click and input actions.
- Android device integration first, with iOS stubbed until supported.
- Accessibility tree parsing and human/machine-readable formatting.
- Verbosity-controlled output with stdout reserved for parseable notices.
- Serialized host requests, device leases, stale-state recovery, and reset modes.

## Stack

- TypeScript 5.x in strict mode.
- pnpm workspaces.
- node:test + tsx for tests.
- tsup for package builds.
- WebDriverIO/Appium for planned mobile automation.

CLI parser and scalar configuration format choices remain open; the implemented project configuration mechanism is `uny.config.js`/`uny.config.mjs` provider composition.
