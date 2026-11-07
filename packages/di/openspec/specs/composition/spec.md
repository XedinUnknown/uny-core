# DI Composition

## Purpose

Provide a composable provider system for assembling named application services. Providers supply keyed
lazy definitions and extensions; `composeProviders` merges them in declaration order so later
definitions win and extension chains accumulate. The result carries a provenance map that records every
contributor to each key, making contribution history available without evaluating any contributed definition.

## Requirements

### Requirement: Public Composition API

The package SHALL expose `composeProviders`, `factory`, `value`, `alias`, and `construct` from
`@uny/di`, and the four helpers from `@uny/di/definitions`. It SHALL export the types `Definition`,
`Extension`, `Provider`, `KeyProvenance`, `ComposedProvider`, `Container`, and
`DependencyAwareDefinition` from its root. The package export map SHALL supply ESM imports and
declaration files for the root, `./definitions`, and `./errors` entry points.

#### Scenario: Consume callable definitions

- **WHEN** a consumer supplies a `Provider` with optional string-keyed definition and extension records
- **THEN** a `Definition<T>` accepts a `Container` and returns `T`, and an `Extension<T>` accepts a
  previous `T | undefined` plus a `Container` and returns `T`
- **THEN** helper-produced definitions are callable and expose `getDependencies(): string[]`

### Requirement: Ordered lazy provider composition

`composeProviders` SHALL traverse the supplied `Map<string, Provider>` in iteration order, collect
definitions into a new record with later definitions replacing earlier definitions for the same key,
and return definition and extension records plus a provenance map. Composition SHALL not invoke
definition or extension functions. Providers with either record omitted and an empty provider map SHALL
be accepted.

#### Scenario: Replace an earlier definition

- **GIVEN** provider `A` defines `key` and later provider `B` defines `key`
- **WHEN** the composed provider is resolved
- **THEN** `B`'s definition is used and neither definition is evaluated during composition

#### Scenario: Compose an empty map

- **WHEN** an empty map is supplied
- **THEN** composition returns empty definition and extension records and an empty provenance map

#### Scenario: Compose providers with no contributions

- **WHEN** all providers in the map omit both the definitions and extensions records
- **THEN** composition returns empty definition and extension records and an empty provenance map

### Requirement: Independent ordered extension chains

Composition SHALL retain extensions independently of definition overrides and chain extensions for each
key in provider iteration order, considering only extensions already contributed under that own key.
Each extension SHALL receive the preceding result and the same lookup container; the first receives the winning definition's result, or `undefined` for an extension-only
key. A later definition SHALL not discard extensions contributed by earlier providers.

#### Scenario: Apply extensions to a winning definition

- **GIVEN** providers `A`, `B`, and `C` are composed in that order; `A` defines `list` and `B` and
  `C` each extend it
- **WHEN** `list` is resolved
- **THEN** the result passes through `B`'s extension then `C`'s extension, in that order, each
  receiving the preceding result and the resolution container

#### Scenario: Resolve an extension-only key

- **WHEN** a key has an extension but no definition
- **THEN** resolution calls its extension chain with an initial `undefined` value

### Requirement: Per-key composition provenance

`composeProviders` SHALL return a `Map<string, KeyProvenance>` containing each own enumerable string
key encountered in provider definition or extension records. Each entry SHALL contain `key`, ordered
`definedBy` provider names including overridden definitions, and ordered `extendedBy` provider names.
Missing contribution kinds SHALL have empty arrays; the last `definedBy` name identifies the winning
contributed definition.

#### Scenario: Record override history

- **GIVEN** providers `A`, `B`, and `C` are composed in that order; `A`, `B`, and `C` each define
  `key`, and `B` and `C` each extend it
- **WHEN** the provenance map is inspected
- **THEN** the entry for `key` contains `definedBy: ["A", "B", "C"]` and `extendedBy: ["B", "C"]`

#### Scenario: Extension-only key has empty definition history

- **WHEN** a key is only extended and never defined across all providers
- **THEN** its provenance entry has an empty `definedBy` array and a non-empty `extendedBy` array

#### Scenario: Order provenance entries by first encounter

- **GIVEN** provider `A` defines `b` then `a` and extends `c`, and later provider `B` defines `c`
  then `d`
- **WHEN** the provenance map's keys are collected in iteration order
- **THEN** the order is `["b", "a", "c", "d"]`, following first encounter order and visiting each
  provider's definition keys before its extension keys

#### Scenario: Register the same provider object under two names

- **GIVEN** the same `Provider` object is placed in the map under two different keys, `"first"` and
  `"second"`, where that provider defines and extends `key`
- **WHEN** composition traverses the map
- **THEN** `definedBy` for `key` records both map-key names in iteration order: `["first", "second"]`,
  and the last definition wins
- **THEN** the extension runs once per map entry, so the extension is applied twice in sequence,
  producing a chained result

#### Scenario: Pass a previously composed provider into a second composition

- **GIVEN** providers `A` and `B` are composed into an inner `ComposedProvider`; `A` defines `key`
  and both `A` and `B` extend `key`, so the inner provenance records
  `definedBy: ["A"]` and `extendedBy: ["A", "B"]` for `key`
- **WHEN** that `ComposedProvider` is placed in an outer map under the key `"bundle"` and composed
  again alongside no other providers
- **THEN** the outer composition treats `bundle`'s `definitions` and `extensions` records as plain
  objects and records `"bundle"` as the single provider name in the outer provenance
- **THEN** the outer provenance for `key` contains `definedBy: ["bundle"]` and
  `extendedBy: ["bundle"]`; the inner history `["A"]` and `["A", "B"]` is not merged
- **THEN** resolving `key` through the outer composition invokes `bundle`'s composed extension, which
  preserves the inner extension order established by `A` then `B`

### Requirement: Callable factory definitions

`factory(deps, fn)` SHALL return a dependency-aware definition that resolves each dependency key in
array order through the supplied container, passes those results as positional callback arguments, and
returns the callback's result. It SHALL report the dependency keys through `getDependencies()`. It SHALL
not resolve dependencies or invoke the callback until the definition is called.

#### Scenario: Resolve factory arguments

- **WHEN** `factory(["dep"], dep => dep * 2)` is resolved with `dep` equal to `42`
- **THEN** the definition returns `84` and reports `["dep"]` as dependencies

### Requirement: Constant and alias definitions

`value(v)` SHALL return a dependency-aware definition returning `v` without cloning it and reporting
no dependencies. `alias(from)` SHALL return a dependency-aware definition that delegates to
`container.resolve(from)` on each invocation and reports `[from]`. These helpers SHALL not
independently cache lookups or wrap errors from the supplied container.

#### Scenario: Return a constant

- **WHEN** a `value` definition is invoked
- **THEN** it returns the supplied value, including the same reference for an object, and reports `[]`

#### Scenario: Resolve an alias

- **WHEN** `alias("original")` is invoked with a container resolving `original` to `"hello"`
- **THEN** it returns `"hello"` and reports `["original"]`

### Requirement: Constructor definitions

`construct(cls, deps)` SHALL return a dependency-aware definition that resolves dependency keys in
array order and returns `new cls(...resolved)`. Omitting `deps` SHALL use an empty array.
`getDependencies()` SHALL return the dependency array used by the definition. The helper itself SHALL
create an instance per invocation rather than provide caching.

#### Scenario: Inject constructor arguments

- **WHEN** `construct(Service, ["dep", "num"])` is invoked with dependency results `"injected"` and
  `123`
- **THEN** it creates a `Service` with those positional arguments and reports `["dep", "num"]`

#### Scenario: Omit constructor dependencies

- **WHEN** `construct(Bar)` is invoked
- **THEN** it constructs `Bar` with no arguments and reports `[]`
