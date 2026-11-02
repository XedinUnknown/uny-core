# DI Containers

## Purpose

Record the container, bootstrap, cycle-detection, and resolution-error behavior implemented by `@uny/di` at commit `5c0e1b5`, including existing limitations. Requirements are grounded in committed source and tests rather than design documents.

## Requirements

### Requirement: Public Container and Error API

The root package SHALL export `DelegatingContainer`, `CachingContainer`, `ProxyContainer`, `CompositeContainer`, `CircularDetector`, `bootstrap`, `DependencyError`, `MissingKeyError`, and `CircularDependencyError`. The error classes SHALL also be exported through `@uny/di/errors`. The `Container` interface SHALL require generic `resolve(key)` and boolean `has(key)` methods and permit an optional `keys(): string[]` method.

#### Scenario: Wrap a Container Without Enumeration

- **WHEN** a consumer implements `resolve` and `has` without `keys`
- **THEN** that object satisfies the public container interface and can be supplied to the decorators and composite container

#### Evidence

- Source: [barrel](../../../packages/di/src/index.ts), [interface](../../../packages/di/src/types.ts#L37-L41), [package entry points](../../../packages/di/package.json#L6-L19).
- Tests: [public imports](../../../packages/di/tests/di.test.ts#L3-L18). Optional enumeration and the complete root error exports are source-derived, not individually tested.

### Requirement: Uncached Provider Resolution

`DelegatingContainer` SHALL resolve a provider definition, then apply its extension if present, and return the result without caching. An extension-only key SHALL start with `undefined`. With neither a truthy definition nor a truthy extension, it SHALL throw `MissingKeyError` whose available list is `Object.keys(provider.definitions ?? {})`, excluding extension-only keys. It SHALL propagate errors from invoked definitions and extensions without wrapping them.

#### Scenario: Repeat Direct Resolution

- **WHEN** a definition increments a counter and its delegating container resolves the key twice
- **THEN** the definition runs twice and the returned counter values differ

#### Scenario: Resolve an Unknown Key

- **WHEN** neither a definition nor an extension is found for a requested key
- **THEN** resolution throws `MissingKeyError` with that key and the own enumerable definition keys as its available list

#### Evidence

- Source: [resolve](../../../packages/di/src/containers.ts#L16-L43).
- Tests: [definition resolution](../../../packages/di/tests/di.test.ts#L86-L92), [extensions](../../../packages/di/tests/di.test.ts#L39-L82), [no caching](../../../packages/di/tests/di.test.ts#L184-L194), [missing keys](../../../packages/di/tests/di.test.ts#L588-L604). Extension-only invocation and unwrapped callback errors are source-derived.

### Requirement: Lookup Container Selection

`DelegatingContainer` SHALL pass its parent container to definitions and extensions when a parent was supplied, and otherwise pass itself. Parent assignment SHALL change callback dependency lookup only; direct `resolve`, `has`, and `keys` on the child SHALL not fall back to or merge the parent.

#### Scenario: Resolve a Dependency Through the Parent

- **WHEN** a child's `usesParent` definition calls its supplied container to resolve `fromParent`
- **THEN** the parent resolves that dependency
- **THEN** directly resolving a key absent from the child provider still throws even if the parent has it

#### Evidence

- Source: [parent selection and local operations](../../../packages/di/src/containers.ts#L17-L56).
- Tests: [parent and self lookup](../../../packages/di/tests/di.test.ts#L94-L131), [extension lookup](../../../packages/di/tests/di.test.ts#L62-L81). Direct parent fallback exclusion is source-derived.

### Requirement: Provider Membership and Enumeration

`DelegatingContainer.has` SHALL use JavaScript `in` checks against the definition and extension records without invoking their functions. `keys()` SHALL return the sorted, deduplicated union of their own enumerable string keys. Membership SHALL therefore include extension-only keys but SHALL not be interpreted as an own-property check or as a guarantee of successful resolution for inherited or malformed entries.

#### Scenario: Enumerate Definitions and Extensions

- **WHEN** a provider defines `a` and `b` and extends `b` and `c`
- **THEN** `keys()` returns `["a", "b", "c"]` and `has("c")` returns `true`

#### Scenario: Observe Inherited Membership

- **WHEN** a provider record inherits a property such as `toString`
- **THEN** `has` can report that property even though `Object.keys` does not enumerate it

#### Evidence

- Source: [has and keys](../../../packages/di/src/containers.ts#L45-L56).
- Tests: [membership and enumeration](../../../packages/di/tests/di.test.ts#L133-L179). Inherited-property behavior and deduplication are source-derived without dedicated assertions.

### Requirement: Successful-Result Caching

`CachingContainer` SHALL cache each value returned by its inner container under the requested key, including `undefined`, falsy values, object references, and promises. Subsequent resolves of that key SHALL return the cached value without calling the inner container. A synchronous throw SHALL not create a cache entry.

#### Scenario: Reuse a Result

- **WHEN** the wrapped container returns a value for a key and the caching container resolves that key again
- **THEN** it returns the first value without resolving the inner container again

#### Scenario: Retry After a Synchronous Failure

- **WHEN** inner resolution throws synchronously and the same key is later requested again
- **THEN** the caching container retries inner resolution rather than caching the failure

#### Scenario: Cache a Returned Promise Immediately

- **WHEN** inner resolution returns a promise
- **THEN** that promise is cached immediately on the first resolve, even if it later rejects, so subsequent resolves return the same promise reference without calling the inner container again

#### Scenario: Query Metadata After Caching a Result

- **WHEN** a caching container has cached a result for `key` and the caller queries its metadata
- **THEN** `has("key")` forwards to the inner container rather than consulting the cache
- **THEN** `keys()` forwards when available or returns `[]` if the inner container omits enumeration
- **THEN** no public cache invalidation operation is available

#### Evidence

- Source: [CachingContainer](../../../packages/di/src/containers.ts#L65-L86).
- Tests: [cache reuse](../../../packages/di/tests/di.test.ts#L196-L206). Falsy values, failure retry, promise handling, metadata forwarding, and lack of invalidation are source-derived.

### Requirement: Replaceable Proxy Delegation

`ProxyContainer` SHALL accept an optional inner container at construction and permit setting or replacing it with `setInnerContainer`. It SHALL forward `resolve` and `has` when configured, and throw an ordinary `Error` with message `ProxyContainer: inner container not set` for either operation when unconfigured. `keys()` SHALL forward available enumeration and otherwise return `[]`, including before configuration.

#### Scenario: Use an Unconfigured Proxy

- **WHEN** an unconfigured proxy is queried
- **THEN** `resolve` and `has` throw the unconfigured-inner error, while `keys()` returns `[]`

#### Scenario: Replace the Inner Container

- **WHEN** `setInnerContainer` is called with another container
- **THEN** subsequent operations delegate to the newly supplied container

#### Evidence

- Source: [ProxyContainer](../../../packages/di/src/containers.ts#L95-L123).
- Tests: [unconfigured errors and forwarding](../../../packages/di/tests/di.test.ts#L211-L243). Constructor injection, replacement, and enumeration are source-derived.

### Requirement: First-Match Composite Resolution

`CompositeContainer` SHALL examine its containers in array order and resolve through the first whose `has(key)` is true. It SHALL not continue to later containers if that selected container's resolution throws. If none matches, it SHALL throw `MissingKeyError(key, [])`. `has` SHALL report whether any container matches, and `keys` SHALL return a sorted, deduplicated union of available inner enumeration, treating omitted `keys` methods as empty lists.

#### Scenario: Prefer the First Match

- **WHEN** two containers report the same key
- **THEN** the composite returns the first container's resolution result
- **THEN** an error from that resolution propagates rather than triggering fallback

#### Scenario: Fall Through Missing Containers

- **WHEN** the first container lacks a key and the second has it
- **THEN** the second container resolves it
- **THEN** if all containers lack the key, the missing-key error has an empty available list, even if unrelated keys exist

#### Evidence

- Source: [CompositeContainer](../../../packages/di/src/containers.ts#L131-L156).
- Tests: [first match, fallback, errors, membership, and enumeration](../../../packages/di/tests/di.test.ts#L247-L311). Selected-container failure propagation, optional enumeration, and empty diagnostics with unrelated keys are source-derived.

### Requirement: Dependency Error Identity and Diagnostics

`DependencyError` SHALL extend `Error` and set its name to `DependencyError`. `MissingKeyError` and `CircularDependencyError` SHALL extend it and set their respective class names. `MissingKeyError` SHALL retain `key` and the supplied `available` array. `CircularDependencyError` SHALL retain `key` and the supplied `chain` array. Both subclasses SHALL format their diagnostics as specified in the scenarios below.

#### Scenario: Report a Missing Key

- **WHEN** `MissingKeyError("missing", ["k1"])` is constructed
- **THEN** its message is `Key not found: "missing" (defined keys: k1)` and it retains the supplied key and array
- **THEN** an empty array produces `defined keys: none`

#### Scenario: Format Multiple Available Keys

- **WHEN** `MissingKeyError("missing", ["k1", "k2"])` is constructed
- **THEN** its message is `Key not found: "missing" (defined keys: k1, k2)`, following `Key not found: "<key>" (defined keys: <list>)` with comma-space-separated keys

#### Scenario: Report a Circular Trace

- **WHEN** `CircularDependencyError` receives key `a` and chain `["a", "b"]`
- **THEN** its stored chain remains `["a", "b"]` and its message trace contains `a`, `b`, and the repeated `a` in order
- **THEN** its message is `Circular dependency detected: a → b → a`, following `Circular dependency detected: <trace>` with spaces around U+2192 and the repeated key appended
- **THEN** the stored chain excludes that appended occurrence unless already present in its supplied input

#### Evidence

- Source: [all error classes](../../../packages/di/src/errors.ts).
- Tests: [missing-key messages and identity](../../../packages/di/tests/di.test.ts#L588-L604), [circular-error identity](../../../packages/di/tests/di.test.ts#L331-L363). Base-class names, stored-array identity, and precise circular trace formatting are source-derived.

### Requirement: Synchronous Reentry Detection

`CircularDetector` SHALL track keys currently resolving through that detector in insertion order and throw `CircularDependencyError` when a key reenters before its earlier call returns. It SHALL provide the active key sequence as the error chain and remove each active key in `finally`, whether resolution succeeds or throws.

#### Scenario: Detect an Indirect Cycle

- **WHEN** definitions resolve `a` to `b` to `c` to `a` through the detector
- **THEN** resolution throws `CircularDependencyError` for `a` with active chain `["a", "b", "c"]`

#### Scenario: Clean Up After Resolution

- **WHEN** a resolution finishes or throws and the same key is later resolved independently
- **THEN** the previous call does not remain marked as active
- **THEN** an acyclic `a` to `b` chain can complete normally

#### Scenario: Forward Detector Metadata

- **WHEN** the caller queries `has` or `keys` on the detector
- **THEN** `has` and available `keys` forward to the inner container, with `keys()` returning `[]` when enumeration is absent

#### Scenario: Limit Detection to Synchronous Routed Calls

- **WHEN** a dependency bypasses the detector or asynchronous work resolves a key after an earlier call has returned a promise
- **THEN** that dependency or asynchronous work is outside the earlier call's synchronous detection scope
- **THEN** detection covers only calls routed through that detector during synchronous resolution

#### Evidence

- Source: [CircularDetector](../../../packages/di/src/circular.ts).
- Tests: [proxy wiring and circular/acyclic chains](../../../packages/di/tests/di.test.ts#L315-L364). Exact chain contents, cleanup after errors, metadata forwarding, and asynchronous limits are source-derived.

### Requirement: Bootstrap Composition and Lookup

`bootstrap(providers, additionalContainers = [])` SHALL compose providers before any resolution. Additional containers take priority over provider-defined keys. Provider definitions and extensions receive a reference to the full application container so they can resolve any key, including those from additional containers. The internal arrangement of decorators is an implementation detail.

#### Scenario: Override a Provider From an Additional Container

- **WHEN** both an additional container and the providers supply `k`
- **THEN** the additional container's value wins and is cached by the application container
- **THEN** a provider callback can resolve keys supplied only by additional containers through its supplied proxy

#### Evidence

- Source: [bootstrap wiring](../../../packages/di/src/bootstrap.ts#L32-L52).
- Tests: [additional priority and full lookup](../../../packages/di/tests/di.test.ts#L379-L434). Extension lookup through the proxy is source-derived.

### Requirement: Bootstrap Caching and Cycle Detection

The container returned by `bootstrap` SHALL cache each resolved value so subsequent resolves return the first result without re-invoking the definition. A direct or indirect circular dependency among provider keys SHALL throw `CircularDependencyError` on first resolution. Bootstrap itself SHALL return without resolving any key eagerly.

#### Scenario: Detect a Provider Cycle Lazily

- **WHEN** providers contain `a` to `b` to `a`
- **THEN** bootstrap itself returns without resolving them
- **THEN** resolving `a` through the application container throws `CircularDependencyError`

#### Scenario: Limit Bootstrap Detection to the Provider Container

- **WHEN** an additional container performs arbitrary internal resolution
- **THEN** bootstrap's detector does not independently guard that resolution because it wraps only the provider container

#### Evidence

- Source: [bootstrap wiring](../../../packages/di/src/bootstrap.ts#L32-L52).
- Tests: [caching and cycles](../../../packages/di/tests/di.test.ts#L368-L434). Detection scope and eager-validation limits are source-derived.

### Requirement: Bootstrap Provenance Service

Bootstrap SHALL install a definition for `app/provenance` returning the composed provenance map, replacing any provider definition under that key after composition. Existing extensions for the key SHALL still apply, and an additional container reporting the key SHALL still take priority. Installing the definition SHALL not add a synthetic provenance entry or alter already recorded provider contribution histories. The returned map SHALL not be cloned or frozen.

#### Scenario: Resolve Composition History

- **WHEN** `A` then `B` define `key` and the bootstrapped `app/provenance` service is resolved without an override or extension
- **THEN** it returns a map whose `key` entry reports `definedBy: ["A", "B"]`
- **THEN** `app/provenance` is enumerable as a container key, but has no provenance entry unless a provider originally contributed that key

#### Scenario: Replace a Contributed Provenance Definition

- **WHEN** a provider defines `app/provenance` and no additional container overrides it
- **THEN** bootstrap replaces that definition with its map-returning definition while retaining the original contribution's provenance and extensions

#### Evidence

- Source: [provenance injection](../../../packages/di/src/bootstrap.ts#L36-L49), [provider enumeration and extensions](../../../packages/di/src/containers.ts#L26-L56).
- Tests: [resolvable provenance](../../../packages/di/tests/di.test.ts#L645-L661). Collision handling, retained extensions, absent synthetic entry, mutability, and enumeration are source-derived without dedicated assertions.
