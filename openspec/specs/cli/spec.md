# CLI Baseline

## Purpose

Record the implemented CLI, configuration loading, and composition inspection behavior at commit `5c0e1b5`, including differences between the package executable and the root script. This is a descriptive baseline, not a specification of planned functionality. Requirements refer to the package CLI unless explicitly scoped to the root script.

## Requirements

### Requirement: Package entrypoints

The `@uny/cli` package SHALL expose its root ESM import and types as `dist/main.js` and `dist/main.d.ts`, with `main(argv)` as the exported function. Its `uny` binary SHALL target `dist/bin/uny.js`, passing `process.argv.slice(2)` to `main`. The package SHALL NOT declare exports for its internal flags, loader, providers, or inspect modules.

#### Scenario: Executable failure

- **WHEN** the package binary's `main` promise rejects with an error
- **THEN** the wrapper SHALL print `error: ${e.message}` to stderr and exit with status 1, rather than requiring programmatic callers of `main` to exit.

#### Evidence

[package exports and binary](../../../packages/cli/package.json#L6-L15), [main export](../../../packages/cli/src/main.ts#L31), [binary wrapper](../../../packages/cli/src/bin/uny.ts#L8-L13).

### Requirement: Flag defaults and project selection

The parser SHALL initialize command to `inspect`, format to `human`, verbose and quiet counts to zero, and help to false. Project directory SHALL default to `process.env.UNY_PROJECT_DIR ?? process.cwd()`, preserving an empty environment value. Each `--project-dir` with a following token SHALL consume that token verbatim, without path resolution or existence checks.

#### Scenario: Explicit project directory takes precedence

- **WHEN** the environment supplies a project directory and arguments contain `--project-dir first --project-dir second`
- **THEN** the selected directory SHALL be the literal string `second`.

#### Scenario: No explicit directory

- **WHEN** `UNY_PROJECT_DIR` is unset and no directory option is supplied
- **THEN** the selected directory SHALL be the current working directory and the default command SHALL be `inspect`.

#### Scenario: Later occurrences replace earlier

- **WHEN** `--project-dir` appears multiple times with different values
- **THEN** the last value SHALL be selected and all values SHALL be taken verbatim without path resolution.

#### Evidence

[flag parser](../../../packages/cli/src/flags.ts#L28-L45), [directory passed to loader](../../../packages/cli/src/main.ts#L58-L65).

### Requirement: Permissive option parsing

The parser SHALL count each exact `-v` and `-q` separately, and consume the next token after `--format` when available, updating format only for `human` or `json`. It SHALL ignore unknown dash-prefixed tokens and trailing value options without a following token. It SHALL NOT implement combined short options, equals-form options, `-h`, or end-of-options delimiter.

#### Scenario: Invalid format does not reject invocation

- **WHEN** arguments include `--format json --format xml -v -v -q -vv --unknown`
- **THEN** format SHALL remain `json`, verbose SHALL be 2, quiet SHALL be 1, and the unrecognized tokens SHALL NOT cause a parsing error.

#### Scenario: Flag-looking value is consumed

- **WHEN** arguments are `--format --help`
- **THEN** format SHALL remain `human` and help SHALL remain false because `--help` was consumed as the format value.

#### Scenario: Value option consumes flag-looking token

- **WHEN** a value option such as `--format` is followed by a token beginning with `--`
- **THEN** that token SHALL be consumed as the option's value, not treated as a separate flag.

#### Evidence

[complete parsing loop](../../../packages/cli/src/flags.ts#L38-L79).

### Requirement: Command selection and help

Each non-dash-prefixed token not consumed as an option value SHALL replace the command only while the current command equals `inspect`. Once a different command is selected, subsequent positional tokens SHALL be ignored. Exact `--help`, unless consumed as an option value, SHALL print usage and return from `main` before any metadata reading, config loading, or dispatch.

#### Scenario: Inspect is a sentinel rather than a locked first command

- **WHEN** arguments are `inspect unknown-command ignored`
- **THEN** the selected command SHALL be `unknown-command`, not `inspect`, and successful bootstrap SHALL be followed by an unknown-command error.

#### Scenario: Help bypasses configuration errors

- **WHEN** arguments include an unconsumed `--help`, even with an unknown command or an invalid project configuration
- **THEN** usage SHALL be printed without loading that configuration or dispatching the command.

#### Scenario: Unknown command after bootstrap

- **WHEN** no `--help` flag is present and the command is not `inspect`
- **THEN** dispatch SHALL throw `unknown command: ${commandName}` after bootstrap completes.

#### Evidence

[command sentinel and help parsing](../../../packages/cli/src/flags.ts#L55-L76), [help short circuit](../../../packages/cli/src/main.ts#L31-L37), [dispatch and usage](../../../packages/cli/src/main.ts#L111-L155), [help and unknown-command tests](../../../packages/cli/tests/cli.inspect.test.ts#L12-L20), [unknown command assertion](../../../packages/cli/tests/cli.inspect.test.ts#L93-L100).

### Requirement: Initial app configuration and providers

The CLI SHALL read `${dirname(fileURLToPath(import.meta.url))}/../../package.json` (relative to the runtime module, not the project) and use its `name` and `version` without field validation. If reading or parsing throws, it SHALL use `uny` and `0.0.0`. In both cases `rootDir` is the selected project directory.

#### Scenario: Metadata cannot be read

- **WHEN** the runtime-relative manifest is absent or invalid JSON
- **THEN** core SHALL receive name `uny`, version `0.0.0`, and the selected project directory as root.

#### Scenario: Initial provider map contains only core

- **WHEN** the CLI builds its initial provider map before config transformation
- **THEN** the map SHALL contain only `core` created with the parsed app configuration, and a shallow copy SHALL be passed to the transform.

#### Evidence

[metadata and map creation](../../../packages/cli/src/main.ts#L39-L65), [base provider map](../../../packages/cli/src/providers.ts#L9-L29).

### Requirement: Project config discovery

The loader SHALL check only `uny.config.js` then `uny.config.mjs` directly inside the selected directory using filesystem access checks. Access failures are treated as absence. It SHALL return null when neither is accessible. The first accessible candidate is imported with `pathToFileURL`; an import or validation failure SHALL NOT trigger fallback to the second candidate.

#### Scenario: JavaScript config wins discovery

- **WHEN** both supported config filenames are accessible
- **THEN** only `uny.config.js` SHALL be selected, even if importing it fails.

#### Scenario: Config is absent

- **WHEN** neither supported file is accessible
- **THEN** the loader SHALL return null and the CLI SHALL continue with its base map before adding CLI overrides.

#### Scenario: Import failure is not retried

- **WHEN** `uny.config.js` is accessible but importing it throws
- **THEN** the error SHALL propagate; `uny.config.mjs` SHALL NOT be attempted as a fallback.

#### Evidence

[discovery and import](../../../packages/cli/src/loader.ts#L27-L54), [no-config test](../../../packages/cli/tests/loader.test.ts#L11-L15).

### Requirement: Config export selection and validation

For default-exported configuration, the loader SHALL accept a function, or a truthy object with a `definitions` or `extensions` property whose `typeof` is `object` (a shallow shape check; null-valued properties satisfy it). Other invalid exports SHALL produce the errors below. Import failures SHALL be wrapped with file path and message.

#### Scenario: Numeric export

- **WHEN** the module exports default `42`
- **THEN** loading SHALL reject it with the invalid-export error identifying type `number`.

#### Scenario: Falsy configuration export

- **WHEN** the module has no named exports and its default export is null, undefined, 0, or an empty string
- **THEN** the loader SHALL throw `${filePath} must export default a Provider or a transform function`.

#### Scenario: Import failure wrapping

- **WHEN** importing the config file throws an error with message `Cannot find module 'x'`
- **THEN** the loader SHALL throw `Failed to import ${filePath}: Cannot find module 'x'`.

#### Evidence

[export validation](../../../packages/cli/src/loader.ts#L47-L87), [invalid export test](../../../packages/cli/tests/loader.test.ts#L41-L48), [invalid fixture](../../../packages/cli/tests/fixtures/bad-export/uny.config.js#L1), [binary error test](../../../packages/cli/tests/cli.inspect.test.ts#L69-L76).

The alternative named-export syntax is intentionally outside this baseline's requirements. This omission does not require rejecting it or changing the loader.

### Requirement: Provider wrapping and transform return semantics

A plain provider export SHALL be wrapped in a transform that shallow-copies the input map and sets the provider under `user`, replacing an existing entry without moving its position. A function export receives the working map and is called synchronously. If it returns the same map, mutations are retained; otherwise the CLI clears the map and copies entries from the returned iterable in order.

#### Scenario: Replacement map controls order

- **WHEN** a transform returns a new map placing `positioned` immediately after `core` and before `other`
- **THEN** the working map SHALL preserve that ordering before the CLI sets its override provider.

#### Scenario: Plain provider does not mutate the loader caller's map

- **WHEN** the loader's wrapped plain-provider transform is invoked on a map without `user`
- **THEN** its returned copy SHALL contain `user` and the input map SHALL remain unchanged.

#### Scenario: Mutating transform retains changes

- **WHEN** a function transform mutates the received map and returns it
- **THEN** all mutations SHALL be present in the working map; no async result or shape validation is applied.

#### Evidence

[provider wrapper](../../../packages/cli/src/loader.ts#L61-L73), [transform application](../../../packages/cli/src/main.ts#L61-L78), [loader tests](../../../packages/cli/tests/loader.test.ts#L17-L39), [positioning test](../../../packages/cli/tests/loader.test.ts#L64-L97), [mutating fixture](../../../packages/cli/tests/fixtures/has-transform/uny.config.js#L1-L8), [replacement-map fixture](../../../packages/cli/tests/fixtures/positioning/uny.config.js#L1-L15), [plain fixture](../../../packages/cli/tests/fixtures/plain-provider/uny.config.js#L1-L5).

### Requirement: CLI override placement and limits

After transformation, the CLI SHALL call `workingMap.set('cli-overrides', ...)` with definitions for `io/verbosity` (`flags.verbose - flags.quiet`) and `output/format` (`flags.format`), installed even when no flags were supplied. An absent `cli-overrides` key is appended last; a present key is replaced in its existing position. Inspect's rendering format uses parsed flags directly, not a resolved `output/format`.

#### Scenario: Normally appended overrides

- **WHEN** a transform adds an earlier provider defining `output/format` and does not preinsert `cli-overrides`
- **THEN** the CLI's format definition SHALL be the last definition of that key and its provenance winner SHALL be `cli-overrides`.

#### Scenario: Existing override name preserves position

- **WHEN** a transform returns a map with `cli-overrides` before a provider defining `io/verbosity`
- **THEN** replacing `cli-overrides` SHALL NOT move it past that provider, and the later provider SHALL remain the definition winner.

#### Scenario: Overrides installed with no flags

- **WHEN** the CLI is invoked without any verbosity or format flags
- **THEN** the `cli-overrides` provider SHALL still be installed with its default-valued definitions.

#### Evidence

[override installation](../../../packages/cli/src/main.ts#L80-L86), [definition precedence and extensions](../../../packages/di/src/compose.ts#L22-L55), [render format selection](../../../packages/cli/src/commands/inspect.ts#L58-L70).

### Requirement: Required core checks

Before bootstrap and dispatch, the CLI SHALL reject a working map without the `core` provider, then compose the map and attempt to resolve `app/rootDir` through a temporary `DelegatingContainer`. A caught `MissingKeyError` becomes the required-key diagnostic; other errors propagate. Resolution success is checked, not value type or origin.

#### Scenario: Core provider removed

- **WHEN** a transform removes `core`
- **THEN** the CLI SHALL throw `required provider 'core' is missing after uny.config.js transform. Did your transform accidentally delete it?`.

#### Scenario: Root key missing

- **WHEN** `core` remains but the temporary resolution throws `MissingKeyError`
- **THEN** the CLI SHALL throw `required key 'app/rootDir' is missing after uny.config.js transform. Did your transform accidentally delete the core provider?`.

#### Evidence

[guards and bootstrap](../../../packages/cli/src/main.ts#L88-L115).

### Requirement: Provenance-based inspection

Inspect SHALL resolve `app/provenance`, iterate its Map entries, omit `app/provenance` itself, and sort rows with `a.key.localeCompare(b.key)`. For each row it SHALL select the last `definedBy` entry as winner (using `-` when absent or falsy), preserve `extendedBy` order, and default missing histories to empty arrays. Service values SHALL NOT be resolved.

#### Scenario: Multiple definitions and extensions

- **WHEN** provenance records definitions from `first`, then `last`, and extensions from `alpha`, then `beta`
- **THEN** the row SHALL show winner `last` and extension order `alpha`, `beta`, without evaluating that key's definition.

#### Scenario: Extension-only key

- **WHEN** a provenance entry has no defining provider but has an extending provider
- **THEN** inspect SHALL include it with `definedBy` equal to `-` rather than requiring the key to resolve successfully.

#### Evidence

[row construction](../../../packages/cli/src/commands/inspect.ts#L22-L56), [composition provenance](../../../packages/di/src/compose.ts#L22-L43), [bootstrap provenance injection](../../../packages/di/src/bootstrap.ts#L36-L42), [fixture integration assertions](../../../packages/cli/tests/cli.inspect.test.ts#L47-L67).

### Requirement: JSON inspection output

For parsed format `json`, inspect SHALL print a two-space-indented JSON array. Every row SHALL contain exactly `key`, `definedBy`, `extendedBy`, `resolved: false`, and `cached: false`; these booleans are fixed output fields, not measured state. An empty row set SHALL serialize as `[]`.

#### Scenario: JSON row shape

- **WHEN** inspection contains a key defined by `core` without extensions
- **THEN** its JSON row SHALL report that key, `definedBy: "core"`, `extendedBy: []`, `resolved: false`, and `cached: false`, without a service value or override-history field.

#### Evidence

[JSON rendering](../../../packages/cli/src/commands/inspect.ts#L58-L67), [JSON process test](../../../packages/cli/tests/cli.inspect.test.ts#L33-L45).

### Requirement: Human inspection output

For human format, inspect SHALL print `KEY`, `DEFINED-BY`, and `EXTENDED-BY` columns, a separator of U+2500 characters, and sorted rows. Key and defining-provider columns SHALL be padded to at least 10 and 11 characters respectively, expanding for content. Extensions display as `[name, name]` or `-`. With no rows it SHALL print only `(no keys)`.

#### Scenario: Empty provenance

- **WHEN** the provenance Map contains no entries other than an optional reserved provenance key
- **THEN** human inspection SHALL print `(no keys)`.

#### Evidence

[human rendering](../../../packages/cli/src/commands/inspect.ts#L74-L103), [human process test](../../../packages/cli/tests/cli.inspect.test.ts#L22-L31).

### Requirement: Inspection provenance errors

Inspect SHALL print `error: app/provenance not available in container` to stderr and call `process.exit(1)` if resolving provenance throws. If the resolved value is not an instance of Map, it SHALL instead print `error: app/provenance is not a Map` and call `process.exit(1)`. No additional validation of individual provenance entries SHALL be implied.

#### Scenario: Wrong provenance type

- **WHEN** the supplied container resolves `app/provenance` to a plain object
- **THEN** inspect SHALL report the not-a-Map error and exit with status 1.

#### Evidence

[provenance error branches](../../../packages/cli/src/commands/inspect.ts#L22-L44).

### Requirement: Root script remains distinct

The root `bin/uny.ts` script SHALL NOT dispatch the package inspect command. Its parser notices `--help` but does not consume `--project-dir` values; project directory comes from `UNY_PROJECT_DIR ?? cwd` only. Help returns before config loading. Otherwise it reads `../package.json` with the same fallback, builds the core-only map, applies its transform, runs core-presence and root-resolution guards, and bootstraps.

#### Scenario: Root script receives inspect and a directory option

- **WHEN** the root script receives `inspect --project-dir /different` and bootstrap succeeds
- **THEN** it SHALL continue to use the environment-or-cwd directory and print `Entrypoint not yet implemented (waiting for @uny/cli module integration)` followed by `Run: node dist/bin/uny.js (from packages/cli) for Phase 2 inspect command`, not an inspection table.

#### Scenario: Root script placeholder output

- **WHEN** the root script completes bootstrap without a `--help` flag
- **THEN** it SHALL print the two literal placeholder lines without resolving or invoking an application entrypoint and without adding verbosity/format overrides.

#### Evidence

[root parser](../../../bin/uny.ts#L24-L49), [metadata, composition, and placeholder output](../../../bin/uny.ts#L92-L166), [root help and error handler](../../../bin/uny.ts#L168-L190); contrast [package dispatch](../../../packages/cli/src/main.ts#L111-L129).

### Requirement: Root script config loader differences

The root script SHALL try only `${projectDir}/uny.config.js` via a manually constructed `file://` URL, select only the default export, and silently return null on import failure or unsupported exports. It SHALL accept functions or truthy objects with a `definitions` property, without the package loader's object-valued property check, `.mjs` discovery, or explicit error diagnostics.

#### Scenario: Root script ignores an invalid default export

- **WHEN** the root script's JavaScript config exports default `42`, or importing that config throws
- **THEN** its loader SHALL return null rather than surface the package loader's configuration error.

#### Scenario: Root script plain provider mutates under user-config

- **WHEN** the root script loads a plain provider export
- **THEN** it SHALL be set under `user-config` in the input map, mutating that map rather than returning a copy.

#### Evidence

[root loader](../../../bin/uny.ts#L51-L71), [root transform application](../../../bin/uny.ts#L121-L132); contrast [package loader](../../../packages/cli/src/loader.ts#L27-L87).
