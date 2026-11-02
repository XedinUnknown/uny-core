# DI Composition

## Purpose

Record the public composition, definition-helper, and provenance behavior implemented by `@uny/di` at commit `5c0e1b5`. Requirements describe the committed source and tests, not planned design contracts. Evidence notes distinguish tested examples from source-derived details.

## Requirements

### Requirement: Public Composition API

The package SHALL expose `composeProviders`, `factory`, `value`, `alias`, and `construct` from `@uny/di`, and the four helpers from `@uny/di/definitions`. It SHALL export the types `Definition`, `Extension`, `Provider`, `KeyProvenance`, `ComposedProvider`, `Container`, and `DependencyAwareDefinition` from its root. The package export map SHALL supply ESM imports and declaration files for the root, `./definitions`, and `./errors` entry points.

#### Scenario: Consume Callable Definitions

- **WHEN** a consumer supplies a `Provider` with optional string-keyed definition and extension records
- **THEN** a `Definition<T>` accepts a `Container` and returns `T`, and an `Extension<T>` accepts a previous `T | undefined` plus a `Container` and returns `T`
- **THEN** helper-produced definitions are callable and expose `getDependencies(): string[]`

#### Evidence

- Source: [exports](../../../packages/di/package.json), [barrel](../../../packages/di/src/index.ts), [types](../../../packages/di/src/types.ts), [helper interface](../../../packages/di/src/definitions.ts).
- Tests: [imports and definition helpers](../../../packages/di/tests/di.test.ts#L1-L18), [callable helper cases](../../../packages/di/tests/di.test.ts#L437-L584). Declaration/export-map details are source-derived rather than individually asserted.

### Requirement: Ordered Lazy Provider Composition

`composeProviders` SHALL traverse the supplied `Map<string, Provider>` in iteration order, collect definitions into a new record with later definitions replacing earlier definitions for the same key, and return definition and extension records plus a provenance map. Composition SHALL not invoke definition or extension functions. Providers with either record omitted and an empty provider map SHALL be accepted.

#### Scenario: Replace an Earlier Definition

- **WHEN** provider `A` defines `key` and later provider `B` defines `key`
- **THEN** resolving the composed definition uses `B`'s definition
- **THEN** neither definition is evaluated merely by composing the providers

#### Scenario: Compose No Contributions

- **WHEN** the map is empty or its providers omit both records
- **THEN** composition returns empty definition and extension records and an empty provenance map

#### Evidence

- Source: [composeProviders](../../../packages/di/src/compose.ts#L15-L64).
- Tests: [override semantics](../../../packages/di/tests/di.test.ts#L23-L35). Laziness, omitted records, and the empty-map result are source-derived without dedicated assertions.

### Requirement: Independent Ordered Extension Chains

Composition SHALL retain extensions independently of definition overrides and chain extensions for each key in provider iteration order. Each extension SHALL receive the preceding result and the same lookup container; the first receives the winning definition's result, or `undefined` for an extension-only key. A later definition SHALL not discard extensions contributed by earlier providers.

#### Scenario: Apply Extensions to a Winning Definition

- **WHEN** several providers extend a key and a later provider replaces its definition
- **THEN** resolution evaluates the winning definition and passes its result through all retained extensions in order
- **THEN** each extension can resolve dependencies through its container argument

#### Scenario: Resolve an Extension-Only Key

- **WHEN** a key has an extension but no definition
- **THEN** resolution calls its extension chain with an initial `undefined` value

#### Evidence

- Source: [independent records and extension chaining](../../../packages/di/src/compose.ts#L22-L55), [extension invocation](../../../packages/di/src/containers.ts#L26-L42).
- Tests: [extension order and dependency lookup](../../../packages/di/tests/di.test.ts#L39-L82), [extension-only membership](../../../packages/di/tests/di.test.ts#L147-L162). Interleaved overrides and extension-only resolution are source-derived, not directly asserted.

### Requirement: Per-Key Composition Provenance

`composeProviders` SHALL return a `Map<string, KeyProvenance>` containing each own enumerable string key encountered in provider definition or extension records. Each entry SHALL contain `key`, ordered `definedBy` provider names including overridden definitions, and ordered `extendedBy` provider names. Missing contribution kinds SHALL have empty arrays; the last `definedBy` name identifies the winning contributed definition.

#### Scenario: Record Override History

- **WHEN** `A`, `B`, and `C` define `key` in that order and `B` and `C` extend it
- **THEN** its provenance contains `definedBy: ["A", "B", "C"]` and `extendedBy: ["B", "C"]`

#### Scenario: Extension-Only Key Has Empty Definition History

- **WHEN** a key is only extended and never defined across all providers
- **THEN** its provenance entry has an empty `definedBy` array and a non-empty `extendedBy` array

#### Scenario: Order Provenance Entries by First Encounter

- **WHEN** `A` defines `b` then `a` and extends `c`, and later `B` defines `c` then `d`
- **THEN** the provenance map's keys are `["b", "a", "c", "d"]`, following first encounter order and visiting each provider's definition keys before its extension keys

#### Scenario: Register the Same Provider Name Twice

- **WHEN** the map contains two entries sharing the same provider name string and each defines `key`
- **THEN** `definedBy` records both occurrences of that name in order, and the last definition wins
- **THEN** `composeProviders` does not deduplicate map entries by name; it traverses whatever the `Map` iteration order supplies

#### Scenario: Pass a Previously Composed Provider Into a Second Composition

- **WHEN** the `ComposedProvider` returned by one `composeProviders` call is used as a provider entry in a subsequent `composeProviders` call
- **THEN** the outer composition traverses the composed provider's `definitions` and `extensions` records as plain objects, recording the entry's map key as the provider name in the outer provenance
- **THEN** the inner provenance from the first call is not merged into the outer call's provenance map; each call produces its own independent provenance

#### Evidence

- Source: [provenance types](../../../packages/di/src/types.ts#L17-L35), [collection](../../../packages/di/src/compose.ts#L20-L44).
- Tests: [override and extension provenance](../../../packages/di/tests/di.test.ts#L608-L643). Entry ordering, extension-only provenance, duplicate-name handling, and nested composition behavior are source-derived.

### Requirement: Callable Factory Definitions

`factory(deps, fn)` SHALL return a dependency-aware definition that resolves each dependency key in array order through the supplied container, passes those results as positional callback arguments, and returns the callback's result. It SHALL expose the supplied dependency array through `getDependencies()` without copying it. It SHALL not resolve dependencies or invoke the callback until the definition is called.

#### Scenario: Resolve Factory Arguments

- **WHEN** `factory(["dep"], dep => dep * 2)` is resolved with `dep` equal to `42`
- **THEN** the definition returns `84` and reports `["dep"]` as dependencies

#### Evidence

- Source: [metadata attachment and factory](../../../packages/di/src/definitions.ts#L27-L56).
- Tests: [factory cases](../../../packages/di/tests/di.test.ts#L440-L466). Array identity and deferred invocation are source-derived.

### Requirement: Constant and Alias Definitions

`value(v)` SHALL return a dependency-aware definition returning `v` without cloning it and reporting no dependencies. `alias(from)` SHALL return a dependency-aware definition that delegates to `container.resolve(from)` on each invocation and reports `[from]`. These helpers SHALL not independently cache lookups or wrap errors from the supplied container.

#### Scenario: Return a Constant

- **WHEN** a `value` definition is invoked
- **THEN** it returns the supplied value, including the same reference for an object, and reports `[]`

#### Scenario: Resolve an Alias

- **WHEN** `alias("original")` is invoked with a container resolving `original` to `"hello"`
- **THEN** it returns `"hello"` and reports `["original"]`

#### Evidence

- Source: [value and alias](../../../packages/di/src/definitions.ts#L64-L76).
- Tests: [value and alias cases](../../../packages/di/tests/di.test.ts#L468-L527). Reference identity, uncached direct invocation, and error propagation are source-derived.

### Requirement: Constructor Definitions

`construct(cls, deps)` SHALL return a dependency-aware definition that resolves dependency keys in array order and returns `new cls(...resolved)`. Omitting `deps` SHALL use an empty array. `getDependencies()` SHALL return the dependency array used by the definition. The helper itself SHALL create an instance per invocation rather than provide caching.

#### Scenario: Inject Constructor Arguments

- **WHEN** `construct(Service, ["dep", "num"])` is invoked with dependency results `"injected"` and `123`
- **THEN** it creates a `Service` with those positional arguments and reports `["dep", "num"]`

#### Scenario: Omit Constructor Dependencies

- **WHEN** `construct(Bar)` is invoked
- **THEN** it constructs `Bar` with no arguments and reports `[]`

#### Evidence

- Source: [construct](../../../packages/di/src/definitions.ts#L89-L100).
- Tests: [construct cases](../../../packages/di/tests/di.test.ts#L529-L583). Repeated direct invocation is source-derived.

### Requirement: Current Composition Boundaries

These scenarios record current source behavior. They are not intentional design guarantees: they describe what the implementation does today, including the absence of validation and isolation that a future version could add without violating stated requirements.

Composition and helpers SHALL use synchronous calls and ordinary JavaScript records, arrays, and maps. They SHALL NOT enforce deep immutability or validate the dependency graph. Returned metadata SHALL remain mutable at this time. Ordinary object property semantics SHALL apply rather than a guaranteed prototype-safe key space.

#### Scenario: Change a Factory Dependency Array

- **WHEN** the caller changes the supplied factory dependency array before invoking the definition
- **THEN** invocation resolves the current array contents and `getDependencies()` returns that same array

#### Scenario: Share Constructor Dependency Metadata

- **WHEN** the caller supplies a dependency array to `construct`
- **THEN** `getDependencies()` returns that same array, as it does for `factory`, rather than a copy

#### Scenario: Replace a Chained Extension After Composition

- **WHEN** the caller replaces a later chained extension in its provider record after composition but before resolution
- **THEN** the chain looks up and invokes the replacement from that record when it runs rather than using a frozen snapshot of provider functions

#### Scenario: Return a Promise

- **WHEN** a definition or extension returns a promise
- **THEN** the implementation passes that promise as an ordinary return value without awaiting it before invoking a subsequent extension

#### Evidence

- Source: [records and captured extension lookup](../../../packages/di/src/compose.ts#L18-L54), [shared helper arrays](../../../packages/di/src/definitions.ts#L27-L55), [synchronous invocation](../../../packages/di/src/containers.ts#L26-L42).
- Tests: [ordinary composition](../../../packages/di/tests/di.test.ts#L23-L82), [helper metadata](../../../packages/di/tests/di.test.ts#L437-L584). These boundary cases have no dedicated tests; they record source behavior, not additional guarantees of validation, isolation, or asynchronous orchestration.
