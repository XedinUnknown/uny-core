# Core Configuration

## Purpose

Supply the foundational application configuration and path keys used across the `uny` system.
`coreProvider` takes a caller-supplied configuration object and returns a provider that exposes app
identity, root and derived paths, and runtime environment as lazily evaluated, container-resolved
definitions that can be overridden or extended through the normal provider composition mechanism.

## Requirements

### Requirement: Core package and provider contract

The `@uny/core` package SHALL expose its root ESM import and types through `dist/index.js` and
`dist/index.d.ts`, with no declared subpath exports. Its source SHALL export `coreProvider(config)`
and the `AppConfig` interface with string fields `name`, `version`, and `rootDir`. Calling
`coreProvider` SHALL return a provider containing definitions.

#### Scenario: Construct the provider

- **WHEN** a caller supplies app configuration to `coreProvider`
- **THEN** it receives a provider defining the eight application keys `app/name`, `app/version`,
  `app/rootDir`, `app/srcDir`, `app/libDir`, `app/workDir`, `app/environment`, and `app/isDebug`,
  without an extensions map or a container being created by this function

### Requirement: App configuration values

The provider SHALL define `app/name`, `app/version`, and `app/rootDir` as functions reading the
respective fields from the supplied config object at definition-invocation time. It SHALL NOT
validate, normalize, clone, or supply defaults for these fields. Callers are responsible for supplying
all field values.

#### Scenario: Values are supplied by the caller

- **GIVEN** the provider receives `name` as `production-app`, `version` as `3.0.0`, and `rootDir`
  as `/var/uny`
- **WHEN** the definitions are resolved without overriding those keys
- **THEN** each definition returns the supplied field unchanged

#### Scenario: Config is read when the definition runs

- **WHEN** the caller changes a config field after creating the provider but before directly invoking
  its corresponding definition
- **THEN** the definition returns the changed field rather than a construction-time snapshot

### Requirement: Derived paths follow container resolution

The provider SHALL define `app/srcDir`, `app/libDir`, and `app/workDir` by resolving `app/rootDir`
from the supplied container and appending `/src`, `/lib`, and `/work`. Overrides visible to the
resolving container SHALL affect derived paths.

#### Scenario: Root overridden through the container

- **GIVEN** the config root is `/var/uny` but an additional override container supplies `app/rootDir`
  as `/tmp/test-project`
- **WHEN** `app/srcDir` is resolved
- **THEN** it returns `/tmp/test-project/src`

### Requirement: Environment and debug definitions

The provider SHALL define `app/environment` as `process.env.NODE_ENV ?? "development"`, read when
that definition executes, preserving an empty string rather than treating it as absent. It SHALL
define `app/isDebug` by resolving `app/environment` through the container and comparing it strictly
with `development`.

#### Scenario: Environment is unset

- **GIVEN** `NODE_ENV` is unset and the environment key is not overridden
- **WHEN** the environment and debug definitions are resolved
- **THEN** the environment definition returns `development` and `app/isDebug` is `true`

#### Scenario: Empty string environment

- **GIVEN** `NODE_ENV` is an empty string and the environment key is not overridden
- **WHEN** the environment and debug definitions are resolved
- **THEN** the environment definition returns the empty string and `app/isDebug` is `false`

#### Scenario: Overridden environment

- **GIVEN** the container overrides `app/environment` to `production`
- **WHEN** `app/isDebug` is resolved
- **THEN** it is `false`
