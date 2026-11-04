# Root Entrypoint

## Purpose

Provide a separate bootstrap script at the repository root (`bin/uny.ts`) that composes
the core provider with optional project configuration and prints a placeholder message
after completing bootstrap. The root script is not a delegation layer for `@uny/cli` and
does not invoke inspection or any other CLI command. It is an independent, unfinished
entrypoint that exists alongside the `@uny/cli` package binary.

## Requirements

### Requirement: Minimal flag handling before configuration

The root script SHALL recognize `--help` before loading any configuration or
performing bootstrap and print usage information, then exit without error. It SHALL
read the project directory from `UNY_PROJECT_DIR` when set, or fall back to the
current working directory. It SHALL NOT support `--project-dir`; that option is
handled by the `@uny/cli` package only.

#### Scenario: Display help without loading configuration

- **GIVEN** the execution environment supplies workspace dependencies and TypeScript execution for `bin/uny.ts`
- **WHEN** the user runs `bin/uny.ts --help`
- **THEN** the script prints usage information and exits with status 0 without
  attempting to load any configuration file or bootstrap the container

#### Scenario: Use the environment variable for project directory

- **GIVEN** the execution environment supplies workspace dependencies and TypeScript execution for `bin/uny.ts`
- **GIVEN** `UNY_PROJECT_DIR` is set to `/projects/example`
- **WHEN** `--help` is not supplied
- **THEN** the script uses `/projects/example` as the project root when loading
  `uny.config.js`

### Requirement: Base provider map construction

The root script SHALL build a base provider map containing at minimum the `core`
provider constructed from the resolved application identity and project root. It
SHALL attempt to load `uny.config.js` from the project directory, silently ignoring
import failures or unsupported export shapes.

#### Scenario: Continue without a configuration file

- **GIVEN** the execution environment supplies workspace dependencies and TypeScript execution for `bin/uny.ts`
- **GIVEN** no `uny.config.js` exists in the project directory
- **WHEN** the script runs without `--help`
- **THEN** it proceeds with the base provider map containing `core` and no
  `user-config` entry

### Requirement: Configuration file acceptance and registration

A plain-provider export is accepted when its default export is a truthy object with a
`definitions` property; that provider SHALL be registered as `user-config` by calling
`set` on the working map directly. A function export SHALL be called with the working
map and its return value used as the new map. An object lacking a `definitions`
property, including an extensions-only provider, SHALL be silently ignored.

#### Scenario: Silently ignore an extensions-only configuration export

- **GIVEN** the execution environment supplies workspace dependencies and TypeScript execution for `bin/uny.ts`
- **GIVEN** `uny.config.js` default-exports a provider object that has an `extensions`
  property but no `definitions` property
- **WHEN** the script loads configuration
- **THEN** it silently ignores the export and proceeds with the base provider map
  unchanged

### Requirement: Required-provider guard

The root script SHALL verify that the `core` provider remains in the working map
after any configuration transform and SHALL verify that `app/rootDir` resolves
successfully. Either failure SHALL report a descriptive error to standard error
and exit with status 1.

#### Scenario: Configuration removes the core provider

- **GIVEN** the execution environment supplies workspace dependencies and TypeScript execution for `bin/uny.ts`
- **GIVEN** `uny.config.js` returns a map without `core`
- **WHEN** the required-provider guard runs
- **THEN** the script reports an error identifying the missing provider and exits
  with status 1

### Requirement: Placeholder completion output

After successful bootstrap, the root script SHALL print two advisory lines to
standard output: the first beginning
with `Entrypoint not yet implemented` and the second beginning with `Run:`,
identifying the current alternative (`packages/cli`) command.

#### Scenario: Successful bootstrap prints placeholder lines

- **GIVEN** the execution environment supplies workspace dependencies and TypeScript execution for `bin/uny.ts`
- **GIVEN** valid provider configuration with no `--help` flag
- **WHEN** the script completes bootstrap
- **THEN** standard output contains a line beginning with
  `Entrypoint not yet implemented` and a line beginning with `Run:`

### Requirement: Error reporting and exit code

The root script SHALL catch top-level errors and report them to standard error with
the prefix `error:` before exiting with status 1.

#### Scenario: Bootstrap error exits with status 1

- **GIVEN** the execution environment supplies workspace dependencies and TypeScript execution for `bin/uny.ts`
- **GIVEN** the required-provider guard throws
- **WHEN** the top-level error handler catches it
- **THEN** standard error contains `error:` followed by the error message and the
  process exits with status 1
