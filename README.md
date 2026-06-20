# Uny

Uny is a planned exploration-first mobile app testing CLI.

Unlike a traditional suite runner, it is intended to run individual commands against a real mobile device while preserving the automation session between invocations. The goal is fast interactive and AI-assisted exploration through commands such as `uny run`, stdin input, feature files, tree inspection, screenshots, and reset/session controls.

## Status

This `master` branch is currently a pre-release placeholder. The baseline TypeScript monorepo and development workflow are planned for the `0.1.x` series.

There is no install, build, test, lint, or run command in this branch yet.

## Planned Design

The runner is planned around config-based modularity:

- Providers contribute keyed lazy definitions and extensions.
- The CLI host owns provider selection, ordering, composition, and runtime bridging.
- Later definitions override earlier ones; extensions layer in deterministic order.
- A single immutable composed container is the source of truth.
- Platform concerns such as Appium, WebDriverIO, ADB, Docker, files, and CLI input are adapted by the host into keys.

## Planned Capabilities

- Persistent WebDriverIO/Appium sessions for fast repeated commands.
- Gherkin and raw command parsing with a custom expression matcher.
- Multi-strategy element discovery for click and input actions.
- Android device integration first, with iOS stubbed until supported.
- Accessibility tree parsing and human/JSON/XML formatting.
- Verbosity-controlled output with stdout reserved for parseable notices.
- File-based run locking, stale-lock recovery, and reset modes.

## Planned Stack

- TypeScript 5.x in strict mode.
- pnpm workspaces.
- Commander.js for the CLI.
- JSON config with JSON Schema validation.
- Vitest for tests.
- tsup for package builds.
- WebDriverIO/Appium for device automation.
