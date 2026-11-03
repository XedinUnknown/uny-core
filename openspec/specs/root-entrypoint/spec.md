# Root Entrypoint

## Purpose

Provide a minimal bootstrap entrypoint at the repository root (`bin/uny.ts`) that
selects providers, composes their configuration, and bootstraps the application container.
The root script is distinct from the
`@uny/cli` package binary: it owns module selection and provider wiring for the
full application, while `@uny/cli` owns the command-line interface, project
configuration loading, and inspection output.

After bootstrap it prints an advisory message rather than invoking an application entrypoint.

## Requirements

### Requirement: Minimal flag handling before configuration

The root script SHALL recognize `--help` before loading any configuration or
performing bootstrap and print usage information, then exit without error. It SHALL
read the project directory from `UNY_PROJECT_DIR` when set, or fall back to the
current working directory. It SHALL NOT support `--project-dir`; that option is
handled by the `@uny/cli` package only.

#### Scenario: Display help without loading configuration

- **WHEN** the user runs `bin/uny.ts --help`
- **THEN** the script prints usage information and exits with status 0 without
  attempting to load any configuration file or bootstrap the container

#### Scenario: Use the environment variable for project directory

- **GIVEN** `UNY_PROJECT_DIR` is set to `/projects/example`
- **WHEN** `--help` is not supplied
- **THEN** the script uses `/projects/example` as the project root when loading
  `uny.config.js`

### Requirement: Module selection and provider composition

The root script SHALL build a base provider map containing at minimum the `core`
provider constructed from the resolved application identity and project root. It
SHALL attempt to load `uny.config.js` from the project directory, silently ignoring
import failures or unsupported export shapes. A plain-provider export SHALL be
registered as `user-config`; a function export SHALL be called with the working map
and its return value used as the new map.

#### Scenario: Continue without a configuration file

- **GIVEN** no `uny.config.js` exists in the project directory
- **WHEN** the script runs without `--help`
- **THEN** it proceeds with the base provider map containing `core` and no
  `user-config` entry

### Requirement: Required-provider guard

The root script SHALL verify that the `core` provider remains in the working map
after any configuration transform and SHALL verify that `app/rootDir` resolves
successfully. Either failure SHALL report a descriptive error to standard error
and exit with status 1.

#### Scenario: Configuration removes the core provider

- **GIVEN** `uny.config.js` returns a map without `core`
- **WHEN** the required-provider guard runs
- **THEN** the script reports an error identifying the missing provider and exits
  with status 1

### Requirement: Placeholder completion output

Until the entrypoint key is implemented, the root script SHALL complete bootstrap
successfully and print two advisory lines to standard output: the first beginning
with `Entrypoint not yet implemented` and the second beginning with `Run:`,
identifying the current alternative (`packages/cli`) command.

#### Scenario: Successful bootstrap prints placeholder lines

- **GIVEN** valid provider configuration with no `--help` flag
- **WHEN** the script completes bootstrap
- **THEN** standard output contains a line beginning with
  `Entrypoint not yet implemented` and a line beginning with `Run:`

### Requirement: Error reporting and exit code

The root script SHALL catch top-level errors and report them to standard error with
the prefix `error:` before exiting with status 1.

#### Scenario: Bootstrap error exits with status 1

- **GIVEN** the required-provider guard throws
- **WHEN** the top-level error handler catches it
- **THEN** standard error contains `error:` followed by the error message and the
  process exits with status 1
