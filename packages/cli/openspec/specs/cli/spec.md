# Command-Line Interface

## Purpose

Provide a command-line entry point for loading project configuration, composing application services,
and inspecting which providers contribute each key. The `uny` command loads the selected project's
configuration, merges it with built-in and command-line settings, and runs the requested command
against the resulting container. Inspection displays provider contribution metadata; row construction
does not request each listed key's value.

## Requirements

### Requirement: Inspect application configuration

The `uny` command SHALL inspect application configuration when invoked without a command or with
`inspect`. It SHALL load the selected project's configuration before displaying the inspection
results.

#### Scenario: Inspect without naming a command

- **GIVEN** a project without a configuration file
- **WHEN** the user runs `uny`
- **THEN** the CLI displays the keys supplied by the core configuration and command-line options

#### Scenario: Explicitly request inspection

- **WHEN** the user runs `uny inspect`
- **THEN** the CLI displays the same inspection as `uny`

### Requirement: Choose the project directory

The CLI SHALL use the directory supplied through `--project-dir`. Without that option, it SHALL use
`UNY_PROJECT_DIR` when set, or the current working directory otherwise. When `--project-dir` is
repeated, the last supplied directory SHALL take precedence.

#### Scenario: Choose a directory explicitly

- **GIVEN** `UNY_PROJECT_DIR` is `/projects/first`
- **WHEN** the user runs `uny --project-dir /projects/second`
- **THEN** the CLI uses `/projects/second` as the project directory

#### Scenario: Choose a directory through the environment

- **GIVEN** `UNY_PROJECT_DIR` is `/projects/example`
- **WHEN** the user runs `uny` without `--project-dir`
- **THEN** the CLI uses `/projects/example` as the project directory

#### Scenario: Use the current directory

- **GIVEN** `UNY_PROJECT_DIR` is unset
- **WHEN** the user runs `uny` without `--project-dir`
- **THEN** the CLI uses the current working directory

#### Scenario: Replace an earlier directory option

- **WHEN** the user runs `uny --project-dir /projects/first --project-dir /projects/second`
- **THEN** the CLI uses `/projects/second`

### Requirement: Show command-line help

The CLI SHALL display usage information for `uny --help` without loading project configuration or
running a command.

#### Scenario: Read help despite a broken project configuration

- **GIVEN** the selected project has an invalid configuration file
- **WHEN** the user runs `uny --help`
- **THEN** the CLI prints usage information without loading that file

### Requirement: Report command failures

The executable SHALL print failures to standard error with the prefix `error:` and exit with status 1.
A command other than `inspect` SHALL produce an unknown-command error after application configuration
has been loaded successfully.

#### Scenario: Request an unknown command

- **GIVEN** the selected project's configuration loads successfully
- **WHEN** the user runs `uny unknown-command`
- **THEN** the CLI reports `error: unknown command: unknown-command` and exits with status 1

### Requirement: Find project configuration

The CLI SHALL look for `uny.config.js`, then `uny.config.mjs`, directly inside the project directory.
It SHALL use the first accessible file. An error loading that file SHALL be reported rather than hidden
by trying the other filename. When neither file is accessible, the CLI SHALL continue without
project-specific configuration.

#### Scenario: Prefer the JavaScript configuration file

- **GIVEN** both supported configuration files are accessible
- **WHEN** the CLI loads project configuration
- **THEN** it loads `uny.config.js`

#### Scenario: Use the alternative extension

- **GIVEN** `uny.config.js` is absent and `uny.config.mjs` is accessible
- **WHEN** the CLI loads project configuration
- **THEN** it loads `uny.config.mjs`

#### Scenario: Continue without project configuration

- **GIVEN** neither supported file is accessible
- **WHEN** the user runs `uny inspect`
- **THEN** inspection includes the built-in configuration without project-specific contributions

#### Scenario: Report a broken configuration file

- **GIVEN** `uny.config.js` exists but fails to import
- **WHEN** the CLI loads project configuration
- **THEN** it reports the file path and import error without trying `uny.config.mjs`

### Requirement: Add project configuration through a provider

A configuration file SHALL be allowed to default-export a provider containing definitions, extensions,
or both. The CLI SHALL register that provider under the name `user`, after the built-in `core`
provider. Loading a plain provider SHALL NOT mutate the caller's provider map.

#### Scenario: Add a project-specific key

- **GIVEN** `uny.config.js` default-exports a provider defining `test/plain`
- **WHEN** the user runs `uny inspect --format json`
- **THEN** the inspection includes `test/plain`

### Requirement: Customize provider selection and order

A configuration file SHALL be allowed to default-export a synchronous function that receives the
provider map and returns the map to use. That function SHALL be able to add, replace, reorder, or
remove providers. The initial map SHALL contain `core`. Returning a different map SHALL make its
entries and order authoritative.

#### Scenario: Add a provider in place

- **GIVEN** the configuration function adds a provider defining `test/key` and returns the map it
  received
- **WHEN** the user runs `uny inspect --format json`
- **THEN** the inspection includes `test/key`

#### Scenario: Return a different provider order

- **GIVEN** the configuration function returns a new map ordered `core`, `positioned`, `other`
- **WHEN** the CLI composes project configuration
- **THEN** it uses that provider order before adding command-line settings

### Requirement: Reject invalid project configuration

The CLI SHALL reject configuration whose default export is not an accepted provider or configuration
function. Named exports SHALL NOT be used as configuration. Its diagnostic SHALL identify the
configuration file and the accepted kinds of export.

#### Scenario: Reject a number as configuration

- **GIVEN** `uny.config.js` default-exports `42`
- **WHEN** the user runs `uny inspect`
- **THEN** the CLI reports that the file must export a provider or function and exits unsuccessfully

#### Scenario: Reject a named provider export

- **GIVEN** `uny.config.js` has no default export and a named export `provider` containing definitions
- **WHEN** the CLI loads project configuration
- **THEN** it reports that the file must export default a provider or function, rather than using the
  named export

### Requirement: Retain required application configuration

After project customization, the CLI SHALL require a provider named `core` and successful resolution
of `app/rootDir`. It SHALL report a missing required provider or key before running the requested
command. These checks SHALL NOT imply that no other services are resolved or that any additional
validation occurs.

#### Scenario: Reject removal of the core provider

- **GIVEN** the configuration function removes `core`
- **WHEN** the CLI prepares to run a command
- **THEN** it reports that the required provider `core` is missing

#### Scenario: Reject a missing project root

- **GIVEN** `core` remains but resolving `app/rootDir` throws `MissingKeyError`
- **WHEN** the CLI prepares to run a command
- **THEN** it reports that the required key `app/rootDir` is missing

### Requirement: Supply command-line settings to application configuration

The CLI SHALL contribute `io/verbosity` as the number of `-v` options minus the number of `-q`
options, and `output/format` as the selected output format. After project customization completes,
it SHALL set the `cli-overrides` provider to these definitions, including when neither option was supplied.

#### Scenario: Supply settings without explicit options

- **WHEN** the user runs `uny inspect` without verbosity or format options
- **THEN** `cli-overrides` contributes `io/verbosity` equal to zero and `output/format` equal to
  `human`

#### Scenario: Combine verbosity options

- **WHEN** the user runs `uny -v -v -q`
- **THEN** `cli-overrides` contributes `io/verbosity` equal to 1

### Requirement: Preserve an existing command-line provider position

Registering `cli-overrides` SHALL append it when absent or replace an existing entry without moving it. If
project configuration placed `cli-overrides` earlier in the map, providers registered after it may
still override those settings.

#### Scenario: cli-overrides inserted by project configuration retains its position

- **GIVEN** the project configuration transform places `cli-overrides` before `extra` in the map
- **WHEN** the CLI sets `cli-overrides` after project customization
- **THEN** `cli-overrides` retains its earlier position and `extra` can still override its values

### Requirement: Show the providers contributing each key

Inspection SHALL list contributed keys in key-name order, excluding `app/provenance`. Each row SHALL
identify the last provider defining the key and all providers extending it in contribution order. A key
with extensions but no definition SHALL still appear, with `-` as its defining provider. Building rows
SHALL NOT request the value of each listed key.

#### Scenario: Show a replaced definition and ordered extensions

- **GIVEN** `first` and then `last` define `example/key`, and `alpha` and then `beta` extend it
- **WHEN** the user inspects the application
- **THEN** the row identifies `last` as the defining provider and lists `alpha`, `beta` as extending
  providers

#### Scenario: Show a key supplied only by an extension

- **GIVEN** `plugin` extends `example/key` and no provider defines it
- **WHEN** the user inspects the application
- **THEN** the row shows `-` as the defining provider and `plugin` as an extending provider

### Requirement: Display a readable inspection table

By default, inspection SHALL display a table with `KEY`, `DEFINED-BY`, and `EXTENDED-BY` columns.
Extensions SHALL appear as a bracketed, comma-separated list, or `-` when absent. An inspection
without displayed keys SHALL print `(no keys)`.

#### Scenario: Display built-in configuration

- **GIVEN** a project without a configuration file
- **WHEN** the user runs `uny inspect`
- **THEN** the output contains the table headings and a row for `app/rootDir`

#### Scenario: Display an empty inspection

- **GIVEN** the inspection history has no keys other than the excluded `app/provenance` key
- **WHEN** the table is rendered
- **THEN** the output is `(no keys)`

### Requirement: Display machine-readable inspection results

With `--format json`, inspection SHALL print a two-space-indented JSON array instead of a table. Each
row SHALL contain `key`, `definedBy`, `extendedBy`, `resolved: false`, and `cached: false`. The last
two fields are fixed output values, not measurements of whether a service has been resolved or cached.

#### Scenario: Read inspection as JSON

- **GIVEN** `core` defines `app/rootDir` without extensions
- **WHEN** the user runs `uny inspect --format json`
- **THEN** the array includes a row with `key: "app/rootDir"`, `definedBy: "core"`,
  `extendedBy: []`, `resolved: false`, and `cached: false`

### Requirement: Report unavailable inspection history

Inspection SHALL exit with status 1 and print a diagnostic to standard error when `app/provenance`,
the service holding contribution history, cannot be resolved or does not return a Map.

#### Scenario: Contribution history cannot be resolved

- **GIVEN** resolving `app/provenance` throws an error
- **WHEN** inspection is requested
- **THEN** it reports `error: app/provenance not available in container` and exits with status 1

#### Scenario: Contribution history has the wrong type

- **GIVEN** `app/provenance` returns a plain object rather than a Map
- **WHEN** inspection is requested
- **THEN** it reports `error: app/provenance is not a Map` and exits with status 1
