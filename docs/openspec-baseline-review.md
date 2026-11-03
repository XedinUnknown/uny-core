# Baseline Review: Evidence and Implementation Notes

This document preserves source-level observations, test-coverage gaps, baseline quirks, and historical
context gathered during the implementation-first baseline review. It accompanies the four capability
specs but does not form part of their normative requirements.

The reviewed commit is [`5c0e1b5`](https://github.com/XedinUnknown/uny-core/tree/5c0e1b5). This setup
was ported from the former `UN1Q-com/uny` OpenSpec exercise; the destination's `packages/` and `bin/`
contents match the original baseline implementation. The named `provider` export alternative was
deliberately excluded from requirements; its implementation remains unchanged.

## Process

This baseline follows the community's [code-first workaround](https://github.com/Fission-AI/OpenSpec/issues/724)
and [maintainer guidance](https://github.com/Fission-AI/OpenSpec/issues/214#issuecomment-3420670314):
read the implementation, generate capability specs, and review them against code.
OpenSpec has no built-in reverse-generation command. Its normal
[existing-project adoption workflow](https://github.com/Fission-AI/OpenSpec/blob/main/docs/existing-projects.md)
grows specs through changes instead; this is an explicitly requested baseline.

1. Use a separate checkout of the recorded commit as implementation evidence.
2. Inspect committed source, tests, fixtures, and package exports by capability.
3. Describe current behavior as requirements and scenarios, with evidence links.
4. Independently review claims against source and tests, preserving current quirks
   rather than fixing them or importing intended behavior.
5. Run strict OpenSpec validation and the existing package tests. Human PR review
   remains necessary before accepting reverse-generated specs as ground truth.

---

## DI Composition

### Evidence

- Source: [exports](../packages/di/package.json),
  [barrel](../packages/di/src/index.ts),
  [types](../packages/di/src/types.ts),
  [helper interface](../packages/di/src/definitions.ts),
  [composeProviders](../packages/di/src/compose.ts#L15-L64),
  [extension invocation](../packages/di/src/containers.ts#L26-L42),
  [provenance types](../packages/di/src/types.ts#L17-L35),
  [collection](../packages/di/src/compose.ts#L20-L44),
  [metadata attachment and factory](../packages/di/src/definitions.ts#L27-L56),
  [value and alias](../packages/di/src/definitions.ts#L64-L76),
  [construct](../packages/di/src/definitions.ts#L89-L100),
  [shared helper arrays](../packages/di/src/definitions.ts#L27-L55),
  [captured extension lookup](../packages/di/src/compose.ts#L18-L54),
  [synchronous invocation](../packages/di/src/containers.ts#L26-L42).
- Tests: [imports and definition helpers](../packages/di/tests/di.test.ts#L1-L18),
  [callable helper cases](../packages/di/tests/di.test.ts#L437-L584),
  [override semantics](../packages/di/tests/di.test.ts#L23-L35),
  [extension order and dependency lookup](../packages/di/tests/di.test.ts#L39-L82),
  [extension-only membership](../packages/di/tests/di.test.ts#L147-L162),
  [override and extension provenance](../packages/di/tests/di.test.ts#L608-L643),
  [factory cases](../packages/di/tests/di.test.ts#L440-L466),
  [value and alias cases](../packages/di/tests/di.test.ts#L468-L527),
  [construct cases](../packages/di/tests/di.test.ts#L529-L583),
  [helper metadata](../packages/di/tests/di.test.ts#L437-L584),
  [ordinary composition](../packages/di/tests/di.test.ts#L23-L82).

### Coverage Notes

- Declaration/export-map details are source-derived rather than individually asserted.
- Laziness, omitted records, and the empty-map result are source-derived without dedicated assertions.
- Interleaved overrides and extension-only resolution are source-derived, not directly asserted.
- Entry ordering, extension-only provenance, duplicate-name handling, and nested composition behavior
  are source-derived.
- Deferred invocation for `factory` is source-derived.
- Reference identity, uncached direct invocation, and error propagation for `value`/`alias` are
  source-derived.
- Repeated direct invocation for `construct` is source-derived.

### Source Observations: Helper Array Identity

`factory(deps, fn)` and `construct(cls, deps)` expose the caller-supplied array directly from
`getDependencies()` rather than returning a copy. Mutating the array between creation and invocation
therefore changes which keys are resolved. `composeProviders` also returns its provenance `Map` and
the `definedBy`/`extendedBy` arrays inside each `KeyProvenance` without cloning or freezing them;
callers can mutate those structures after composition. These are observed source behaviors with no
dedicated tests; they are not normative guarantees.

### Source Observations: Extension Lookup Timing

Composition captures a reference to each provider's `extensions` record and the string `key` in a
closure. When the composed extension chain runs at resolution time it looks up
`provider.extensions[key]` on the original record rather than capturing the function value at
composition time. Replacing a function on a provider's `extensions` object after calling
`composeProviders` but before resolving therefore takes effect at resolution. Only the *later* entries
in a chained extension are live-looked-up this way; the *first* extension for a key is captured
directly (assigned to `composedExts[key]`). There are no dedicated tests for this behavior.

### Source Observations: Synchronous Evaluation

All composition and resolution paths use synchronous function calls. When a definition or extension
returns a promise, that promise is passed as an ordinary value to the next extension rather than being
awaited first. There are no dedicated tests for promise pass-through behavior.

### Historical Quirks

- `composeProviders` accepts the same provider object registered under different map keys. The
  composition code iterates `(name, provider)` pairs and records each `name` in `definedBy` and
  `extendedBy` arrays without checking for object identity. Each map key acts as an independent
  provenance name regardless of whether the underlying provider object is shared.
- A `ComposedProvider` used as an entry in a second `composeProviders` call is treated as a plain
  provider; the outer composition records the map key as the provider name and ignores the inner
  provenance. Each composition produces an independent provenance.

---

## DI Containers

### Evidence

- Source: [barrel](../packages/di/src/index.ts),
  [interface](../packages/di/src/types.ts#L37-L41),
  [package entry points](../packages/di/package.json#L6-L19),
  [resolve](../packages/di/src/containers.ts#L16-L43),
  [parent selection and local operations](../packages/di/src/containers.ts#L17-L56),
  [has and keys](../packages/di/src/containers.ts#L45-L56),
  [CachingContainer](../packages/di/src/containers.ts#L65-L86),
  [ProxyContainer](../packages/di/src/containers.ts#L95-L123),
  [CompositeContainer](../packages/di/src/containers.ts#L131-L156),
  [all error classes](../packages/di/src/errors.ts),
  [CircularDetector](../packages/di/src/circular.ts),
  [bootstrap wiring](../packages/di/src/bootstrap.ts#L32-L52),
  [provenance injection](../packages/di/src/bootstrap.ts#L36-L49),
  [provider enumeration and extensions](../packages/di/src/containers.ts#L26-L56).
- Tests: [public imports](../packages/di/tests/di.test.ts#L3-L18),
  [definition resolution](../packages/di/tests/di.test.ts#L86-L92),
  [extensions](../packages/di/tests/di.test.ts#L39-L82),
  [no caching](../packages/di/tests/di.test.ts#L184-L194),
  [missing keys](../packages/di/tests/di.test.ts#L588-L604),
  [parent and self lookup](../packages/di/tests/di.test.ts#L94-L131),
  [extension lookup](../packages/di/tests/di.test.ts#L62-L81),
  [membership and enumeration](../packages/di/tests/di.test.ts#L133-L179),
  [cache reuse](../packages/di/tests/di.test.ts#L196-L206),
  [unconfigured errors and forwarding](../packages/di/tests/di.test.ts#L211-L243),
  [first match, fallback, errors, membership, and enumeration](../packages/di/tests/di.test.ts#L247-L311),
  [missing-key messages and identity](../packages/di/tests/di.test.ts#L588-L604),
  [circular-error identity](../packages/di/tests/di.test.ts#L331-L363),
  [proxy wiring and circular/acyclic chains](../packages/di/tests/di.test.ts#L315-L364),
  [caching and cycles](../packages/di/tests/di.test.ts#L368-L434),
  [additional priority and full lookup](../packages/di/tests/di.test.ts#L379-L434),
  [resolvable provenance](../packages/di/tests/di.test.ts#L645-L661).

### Coverage Notes

- Optional enumeration and the complete root error exports are source-derived, not individually tested.
- Extension-only invocation and unwrapped callback errors are source-derived.
- Direct parent fallback exclusion is source-derived.
- Inherited-property behavior and deduplication for `has`/`keys` are source-derived without dedicated
  assertions.
- Falsy values, failure retry, promise handling, metadata forwarding, and lack of invalidation in
  `CachingContainer` are source-derived.
- Constructor injection, replacement, and enumeration for `ProxyContainer` are source-derived.
- Selected-container failure propagation, optional enumeration, and empty diagnostics with unrelated
  keys in `CompositeContainer` are source-derived.
- Base-class names, stored-array identity, and precise circular trace formatting are source-derived.
- Exact chain contents, cleanup after errors, metadata forwarding, and asynchronous limits for
  `CircularDetector` are source-derived.
- Extension lookup through the proxy in bootstrap is source-derived.
- Detection scope and eager-validation limits in bootstrap are source-derived.
- Collision handling, retained extensions, absent synthetic entry, mutability, and enumeration for the
  bootstrap provenance service are source-derived without dedicated assertions.

### Historical Quirks

- `DelegatingContainer.has` uses JavaScript `in` checks rather than `Object.hasOwn`; it therefore
  matches inherited properties on definition and extension record objects, which `keys()` (using
  `Object.keys`) does not enumerate.
- `MissingKeyError` available list is built from `Object.keys(provider.definitions ?? {})`, which
  excludes extension-only keys. The error's available list may therefore omit keys that `has()`
  returns `true` for.
- `CachingContainer` caches promises immediately on first resolve, even if the promise later rejects.
  Subsequent callers receive the same rejected promise without triggering inner resolution again.
- Bootstrap installs a `app/provenance` definition after composition, replacing any provider-supplied
  definition for that key (while retaining any provider extensions and respecting additional-container
  priority). No synthetic provenance entry is created for the bootstrap-installed definition itself.
  The returned provenance map is not cloned or frozen.

---

## Core Configuration

### Evidence

- Source: [package exports](../packages/core/package.json#L5-L13),
  [interface and provider](../packages/core/src/index.ts#L9-L37),
  [config-backed definitions](../packages/core/src/index.ts#L19-L25),
  [derived definitions](../packages/core/src/index.ts#L27-L30),
  [environment definitions](../packages/core/src/index.ts#L32-L35),
  [CLI-owned defaults](../packages/cli/src/main.ts#L39-L56).
- Tests: [version test](../packages/core/tests/core.test.ts#L8-L24),
  [override test](../packages/core/tests/core.test.ts#L8-L24),
  [test container's additional-container override](../packages/core/tests/test-helper.ts#L14-L26).

### Coverage Notes

- Config-backed definition laziness and live-read behavior have a single test scenario combining
  version assertion with override; full field-by-field and mutation tests are source-derived.
- Environment definitions are source-derived; there are no dedicated tests for `app/environment` or
  `app/isDebug`.

### Historical Quirks

- Derived path definitions (`app/srcDir`, `app/libDir`, `app/workDir`) use template-literal string
  interpolation without separator normalization: `\`${c.resolve("app/rootDir")}/src\``. When
  `app/rootDir` ends with a slash the derived paths contain a double slash (e.g., `/project//src`).
- `coreProvider` does not validate, normalize, or supply defaults for the `AppConfig` fields it
  receives. The CLI caller is responsible for choosing defaults (such as `process.cwd()` for
  `rootDir`); those defaults are not attributed to the core provider.
- Config-field definitions read from the config object at invocation time rather than capturing values
  at construction time. Container caching (e.g., from `CachingContainer` or `bootstrap`) is external
  to the definition itself and is the mechanism that prevents repeated live reads in practice.

---

## CLI

### Evidence

- Source: [default command](../packages/cli/src/flags.ts),
  [configuration and dispatch](../packages/cli/src/main.ts),
  [directory selection](../packages/cli/src/flags.ts#L28-L45),
  [directory used for configuration loading](../packages/cli/src/main.ts#L58-L65),
  [help before configuration loading](../packages/cli/src/main.ts#L31-L37),
  [command dispatch](../packages/cli/src/main.ts#L118-L129),
  [executable error handling](../packages/cli/src/bin/uny.ts),
  [discovery and import errors](../packages/cli/src/loader.ts#L27-L54),
  [provider loading and registration](../packages/cli/src/loader.ts#L61-L86),
  [configuration function application](../packages/cli/src/main.ts#L58-L78),
  [export checks](../packages/cli/src/loader.ts#L47-L87),
  [required configuration checks](../packages/cli/src/main.ts#L88-L109),
  [option counting](../packages/cli/src/flags.ts),
  [settings provider](../packages/cli/src/main.ts#L80-L86),
  [row construction](../packages/cli/src/commands/inspect.ts#L22-L56),
  [contribution history](../packages/di/src/compose.ts),
  [table rendering](../packages/cli/src/commands/inspect.ts#L74-L103),
  [JSON rendering](../packages/cli/src/commands/inspect.ts#L58-L67),
  [inspection errors](../packages/cli/src/commands/inspect.ts#L22-L34),
  [package manifest](../packages/cli/package.json).
- Tests: [inspection without a config file](../packages/cli/tests/cli.inspect.test.ts#L22-L31),
  [help invocation](../packages/cli/tests/cli.inspect.test.ts#L13-L20),
  [unknown command](../packages/cli/tests/cli.inspect.test.ts#L93-L100),
  [absent configuration](../packages/cli/tests/loader.test.ts#L11-L15),
  [plain-provider loading](../packages/cli/tests/loader.test.ts#L17-L27),
  [visible project key](../packages/cli/tests/cli.inspect.test.ts#L58-L67),
  [configuration function and ordering](../packages/cli/tests/loader.test.ts),
  [visible transformed key](../packages/cli/tests/cli.inspect.test.ts#L47-L56),
  [invalid export](../packages/cli/tests/loader.test.ts#L41-L48),
  [executable diagnostic](../packages/cli/tests/cli.inspect.test.ts#L69-L76),
  [project keys appear](../packages/cli/tests/cli.inspect.test.ts#L47-L67),
  [readable table](../packages/cli/tests/cli.inspect.test.ts#L22-L31),
  [JSON output](../packages/cli/tests/cli.inspect.test.ts#L33-L45).

### Coverage Notes

- Directory precedence cases are source-derived, without dedicated test assertions.
- Bypassing broken configuration with `--help` is source-derived.
- Unknown-command test asserts a nonzero exit and an `unknown command` diagnostic, not the exact
  complete message or status 1.
- Filename precedence and import-failure handling are source-derived.
- Map isolation for plain-provider registration is source-derived.
- The spawned-process positioning test checks key presence, not provider precedence.
- Both required-configuration failure cases are source-derived, without dedicated tests.
- Verbosity and format settings values are source-derived. No claim is made that inspection changes
  its diagnostic detail in response to verbosity.
- Winner selection, ordering, extension-only rows, and row-construction laziness are source-derived.
- Empty output and extension formatting are source-derived.
- JSON output test asserts an array and the presence of key and provider fields, not the exact row
  shape or fixed boolean values.
- Both provenance-unavailability failure cases are source-derived, without dedicated tests.

### Implementation Notes

#### Programmatic Interface

`@uny/cli` exports `main(argv)` and its types. The package's `uny` executable calls it with the
process arguments. Internal parser, configuration loader, provider-map builder, and inspection modules
are not declared package subpath exports. Runtime output paths are `dist/main.js`, `dist/main.d.ts`,
and `dist/bin/uny.js` ([package manifest](../packages/cli/package.json)).

#### Application Identity

Startup reads name and version from `../../package.json` relative to the running CLI module, not from
the selected project's manifest. Read or JSON-parsing failure falls back to `uny` and `0.0.0`;
successfully parsed fields are not validated. The selected project directory supplies `app/rootDir`
([startup](../packages/cli/src/main.ts#L39-L56)).

#### Option-Handling Limitations

The following are source observations, not recommended command syntax or promises to retain permissive
parsing ([parser](../packages/cli/src/flags.ts)):

- Directory values are passed through without path normalization or existence checks. An empty
  `UNY_PROJECT_DIR` is preserved.
- Unknown options and options missing their final value are ignored. Combined options such as `-vv`,
  equals-form options, `-h`, and `--` as an end-of-options delimiter are not supported.
- A value-taking option consumes the next argument even when it looks like another option. For example,
  `uny --format --help` consumes `--help` as an invalid format value and does not display help.
- An invalid format leaves the previously selected format unchanged. For example, `--format json
  --format xml` still selects JSON.
- Command selection continues replacing the command while its value is `inspect`. Thus `uny inspect
  unknown-command ignored` selects `unknown-command`. Once a different command is selected, later
  positional arguments are ignored.

#### Configuration-Loading Limitations

Provider validation is shallow: a `definitions` or `extensions` property with JavaScript type `object`
qualifies, including a null-valued property. Missing or falsy exports and unsupported export types use
different error messages. Configuration functions are called synchronously without additional
return-shape or asynchronous-result validation ([loader](../packages/cli/src/loader.ts),
[application](../packages/cli/src/main.ts#L61-L78)). Alternative named-export syntax is outside
the requirements; its loader support is unchanged.

A plain provider is registered by copying the input map and setting `user`. An existing `user` entry is
replaced without changing its position. Likewise, registering `cli-overrides` replaces an existing
entry without moving it. A later provider can therefore still override those settings if project
configuration already placed `cli-overrides` earlier. Inspection selects its renderer directly from the
command-line option, not by resolving `output/format`
([registration](../packages/cli/src/main.ts#L80-L86),
[rendering](../packages/cli/src/commands/inspect.ts#L58-L70)).

#### Inspection Can Still Execute Dependencies

Startup explicitly resolves `app/rootDir` through a temporary uncached container. Inspection explicitly
resolves `app/provenance` through the application container. Definitions and extensions for either key
may resolve further dependencies. Therefore inspection is not guaranteed to execute no application code:
only constructing the displayed rows avoids requesting each listed key's value
([startup check](../packages/cli/src/main.ts#L96-L109),
[history lookup](../packages/cli/src/commands/inspect.ts#L22-L56)).

Rows are sorted with `localeCompare`. Table columns expand to fit content, with minimum widths of 10
and 11 characters for the key and defining provider. History entries are not individually validated.
These formatting and validation details are source-derived, not separately asserted by the process
tests.

#### Separate Root Script

The repository's `bin/uny.ts` is a separate, unfinished executable, not the package's `uny` command.
It does not run inspection. After successful startup it prints two placeholder lines beginning
`Entrypoint not yet implemented` and `Run: node dist/bin/uny.js`
([root script](../bin/uny.ts)).

The root script uses only `UNY_PROJECT_DIR` or the current directory, ignores `--project-dir`, and
recognizes `--help` before loading configuration. It tries only `uny.config.js`, silently ignores
import failures and unsupported exports, and registers a plain provider as `user-config` by mutating
its input map. It does not add verbosity or output-format settings. These differences are historical
limitations, not requirements for the package CLI.
