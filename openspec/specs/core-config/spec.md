# Core Configuration Baseline

## Purpose

Record the implemented `@uny/core` provider's configuration keys, derived paths, and environment behavior at commit `49e7a62`. This baseline describes source and test behavior only, without adding application execution features.

## Requirements

### Requirement: Core package and provider contract

The `@uny/core` package SHALL expose its root ESM import and types through `dist/index.js` and `dist/index.d.ts`, with no declared subpath exports. Its source SHALL export `coreProvider(config)` and the `AppConfig` interface with string fields `name`, `version`, and `rootDir`. Calling `coreProvider` SHALL return a provider containing definitions.

#### Scenario: Constructing the provider

- **WHEN** a caller supplies app configuration to `coreProvider`
- **THEN** it SHALL receive a provider defining the eight implemented `app/*` keys, without an extensions map or a container being created by this function.

#### Evidence

[package exports](../../../packages/core/package.json#L5-L13), [interface and provider](../../../packages/core/src/index.ts#L9-L37).

### Requirement: App configuration values

The provider SHALL define `app/name`, `app/version`, and `app/rootDir` as functions reading the respective fields from the supplied config object at definition-invocation time. It SHALL NOT validate, normalize, clone, or supply defaults for these fields. Defaults chosen by a CLI caller SHALL NOT be attributed to the core provider.

#### Scenario: Values are supplied by the caller

- **WHEN** the provider receives name `production-app`, version `3.0.0`, and root `/var/uny`, without overriding those keys
- **THEN** its definitions SHALL return those supplied fields unchanged.

#### Scenario: Config is read when the definition runs

- **WHEN** the caller changes a config field after creating the provider but before directly invoking its corresponding definition
- **THEN** the definition SHALL return the changed field, rather than a construction-time snapshot; any subsequent container caching is outside this definition's behavior.

#### Evidence

[config-backed definitions](../../../packages/core/src/index.ts#L19-L25), [version test](../../../packages/core/tests/core.test.ts#L8-L24), [CLI-owned defaults](../../../packages/cli/src/main.ts#L39-L56).

### Requirement: Derived paths follow container resolution

The provider SHALL define `app/srcDir`, `app/libDir`, and `app/workDir` by resolving `app/rootDir` from the supplied container and appending `/src`, `/lib`, and `/work` via string interpolation. It SHALL NOT normalize separators, resolve to an absolute path, or create directories. Overrides visible to the resolving container SHALL therefore affect derived paths.

#### Scenario: Root overridden through the test container

- **WHEN** config root is `/var/uny` but an additional override container supplies `app/rootDir` as `/tmp/test-project`
- **THEN** `app/srcDir` SHALL resolve to `/tmp/test-project/src` and the unchanged version SHALL remain `3.0.0`.

#### Scenario: Root contains a trailing slash

- **WHEN** the resolving container supplies `/project/` as `app/rootDir`
- **THEN** the derived definitions SHALL return `/project//src`, `/project//lib`, and `/project//work`, without removing the doubled separator.

#### Evidence

[derived definitions](../../../packages/core/src/index.ts#L27-L30), [override test](../../../packages/core/tests/core.test.ts#L8-L24), [test container's additional-container override](../../../packages/core/tests/test-helper.ts#L14-L26).

### Requirement: Environment and debug definitions

The provider SHALL define `app/environment` as `process.env.NODE_ENV ?? "development"`, read when that definition executes, preserving an empty string rather than treating it as absent. It SHALL define `app/isDebug` by resolving `app/environment` through the container and comparing it strictly with `development`.

#### Scenario: Environment is unset

- **WHEN** `NODE_ENV` is unset and the environment key is not overridden
- **THEN** the environment definition SHALL return `development` and debug SHALL be true when the container resolves that value.

#### Scenario: Empty or overridden environment

- **WHEN** `NODE_ENV` is an empty string, or the container overrides `app/environment` to `production`
- **THEN** the respective resolved environment SHALL remain the empty string or `production`, and `app/isDebug` SHALL be false.

#### Evidence

[environment definitions](../../../packages/core/src/index.ts#L32-L35).
