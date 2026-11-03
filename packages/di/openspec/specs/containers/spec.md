# DI Containers

## Purpose

Provide the runtime containers that resolve composed providers into service values. `DelegatingContainer`
evaluates definitions and extension chains on demand. `CachingContainer` retains each result so
repeated resolution returns the first value. `ProxyContainer` holds a late-bound inner container to
close forward-reference delegation loops during bootstrap (for example, allowing provider definitions
to receive the final application container before that container is fully constructed). `CompositeContainer`
tries multiple containers in priority order. `CircularDetector` guards against infinite resolution
loops. `bootstrap` wires these pieces into a ready-to-use application container.

## Requirements

### Requirement: Public container and error API

The root package SHALL export `DelegatingContainer`, `CachingContainer`, `ProxyContainer`,
`CompositeContainer`, `CircularDetector`, `bootstrap`, `DependencyError`, `MissingKeyError`, and
`CircularDependencyError`. The error classes SHALL also be exported through `@uny/di/errors`. The
`Container` interface SHALL require generic `resolve(key)` and boolean `has(key)` methods and permit
an optional `keys(): string[]` method.

#### Scenario: Wrap a container without enumeration

- **WHEN** a consumer implements `resolve` and `has` without `keys`
- **THEN** that object satisfies the public container interface and can be supplied to the decorators
  and composite container

### Requirement: Uncached provider resolution

`DelegatingContainer` SHALL resolve a provider definition, then apply its extension if present, and
return the result without caching. Lookup uses property access (`record[key]`), reaching inherited
properties. An extension-only key starts with `undefined`. With neither a truthy definition nor
a truthy extension, it SHALL throw `MissingKeyError` listing the provider's own enumerable definition
keys. It SHALL propagate errors from definitions and extensions without wrapping them.

#### Scenario: Repeat direct resolution

- **WHEN** a definition increments a counter and its delegating container resolves the key twice
- **THEN** the definition runs twice and the returned counter values differ

#### Scenario: Resolve an unknown key

- **WHEN** neither a definition nor an extension is found for a requested key
- **THEN** resolution throws `MissingKeyError` with that key and the own enumerable definition keys as
  its available list

#### Scenario: Resolve an inherited definition

- **GIVEN** the definition record's prototype defines a property `inherited` as a function returning
  `"inherited-value"`
- **WHEN** `resolve("inherited")` is called
- **THEN** it returns `"inherited-value"` and does not throw, because property access traverses the
  prototype chain

### Requirement: Lookup container selection

`DelegatingContainer` SHALL pass its parent container to definitions and extensions when a parent was
supplied, and otherwise pass itself. Parent assignment SHALL change callback dependency lookup only;
direct `resolve`, `has`, and `keys` on the child SHALL not fall back to or merge the parent.

#### Scenario: Resolve a dependency through the parent

- **GIVEN** a child `DelegatingContainer` whose `usesParent` definition calls its supplied container
  to resolve `fromParent`
- **WHEN** `usesParent` is resolved
- **THEN** the parent supplies `fromParent`

#### Scenario: Direct child lookup does not fall back to the parent

- **GIVEN** a child `DelegatingContainer` with a parent that defines a key absent from the child
- **WHEN** that key is resolved directly on the child
- **THEN** resolution throws even though the parent has it

### Requirement: Provider membership and enumeration

`DelegatingContainer.has` SHALL report whether a key is reachable in the definition or extension
records without invoking their functions. The lookup uses JavaScript `in`, which matches inherited
properties in addition to own enumerable properties. `keys()` SHALL return the sorted, deduplicated
union of the own enumerable string keys of the definition and extension records, including
extension-only own keys; inherited-property keys reported by `has` are not included.

#### Scenario: Enumerate definitions and extensions

- **WHEN** a provider defines `a` and `b` and extends `b` and `c` as own enumerable keys
- **THEN** `keys()` returns `["a", "b", "c"]` and `has("c")` returns `true`

#### Scenario: has matches inherited properties

- **GIVEN** the definition record's prototype defines a property `inherited`
- **WHEN** `has("inherited")` is called
- **THEN** it returns `true`, and `"inherited"` does not appear in `keys()`

### Requirement: Successful-result caching

`CachingContainer` SHALL cache each value returned by its inner container under the requested key,
including `undefined`, falsy values, object references, and promises. Subsequent resolves of that key
SHALL return the cached value without calling the inner container. A synchronous throw SHALL not create
a cache entry.

#### Scenario: Reuse a result

- **WHEN** the wrapped container returns a value for a key and the caching container resolves that key
  again
- **THEN** it returns the first value without resolving the inner container again

#### Scenario: Retry after a synchronous failure

- **WHEN** inner resolution throws synchronously and the same key is later requested again
- **THEN** the caching container retries inner resolution rather than caching the failure

#### Scenario: Cache a returned promise immediately

- **WHEN** inner resolution returns a promise
- **THEN** that promise is cached immediately on the first resolve, even if it later rejects, so
  subsequent resolves return the same promise reference without calling the inner container again

#### Scenario: Query metadata after caching a result

- **WHEN** a caching container has cached a result for `key` and the caller queries its metadata
- **THEN** `has("key")` forwards to the inner container rather than consulting the cache
- **THEN** `keys()` forwards when available or returns `[]` if the inner container omits enumeration
- **THEN** no public cache invalidation operation is available

### Requirement: Replaceable proxy delegation

`ProxyContainer` SHALL accept an optional inner container at construction and permit setting or
replacing it with `setInnerContainer`. It SHALL forward `resolve` and `has` when configured, and throw
an ordinary `Error` with message `ProxyContainer: inner container not set` for either operation when
unconfigured. `keys()` SHALL forward available enumeration and otherwise return `[]`, including before
configuration.

#### Scenario: Use an unconfigured proxy

- **WHEN** an unconfigured proxy is queried
- **THEN** `resolve` and `has` throw the unconfigured-inner error, while `keys()` returns `[]`

#### Scenario: Replace the inner container

- **WHEN** `setInnerContainer` is called with another container
- **THEN** subsequent operations delegate to the newly supplied container

### Requirement: First-match composite resolution

`CompositeContainer` SHALL examine its containers in array order and resolve through the first whose
`has(key)` is true. It SHALL not continue to later containers if that selected container's resolution
throws. If none matches, it SHALL throw `MissingKeyError(key, [])`. `has` SHALL report whether any
container matches, and `keys` SHALL return a sorted, deduplicated union of available inner enumeration,
treating omitted `keys` methods as empty lists.

#### Scenario: Prefer the first match

- **WHEN** two containers both report the same key
- **THEN** the composite returns the first container's resolution result

#### Scenario: Selected-container failure propagates

- **WHEN** the selected container's `has` returns true but its resolution throws
- **THEN** the error propagates rather than triggering fallback to the next container

#### Scenario: Fall through to the second container

- **WHEN** the first container lacks a key and the second has it
- **THEN** the second container resolves it

#### Scenario: All containers missing the key

- **WHEN** no container reports the key
- **THEN** `MissingKeyError` is thrown with an empty available list, even if unrelated keys exist in
  the containers

### Requirement: Dependency error identity and diagnostics

`DependencyError` SHALL extend `Error` and set its name to `DependencyError`. `MissingKeyError` and
`CircularDependencyError` SHALL extend it and set their respective class names. `MissingKeyError`
SHALL retain `key` and the supplied `available` array. `CircularDependencyError` SHALL retain `key`
and the supplied `chain` array. Both subclasses SHALL format their diagnostics as specified in the
scenarios below.

#### Scenario: Report a missing key with available keys

- **WHEN** `MissingKeyError("missing", ["k1"])` is constructed
- **THEN** its message is `Key not found: "missing" (defined keys: k1)` and it retains the supplied
  key and array

#### Scenario: Report a missing key with no available keys

- **WHEN** `MissingKeyError("missing", [])` is constructed
- **THEN** its message contains `defined keys: none`

#### Scenario: Format multiple available keys

- **WHEN** `MissingKeyError("missing", ["k1", "k2"])` is constructed
- **THEN** its message is `Key not found: "missing" (defined keys: k1, k2)`, following
  `Key not found: "<key>" (defined keys: <list>)` with comma-space-separated keys

#### Scenario: Report a circular trace

- **WHEN** `CircularDependencyError` receives key `a` and chain `["a", "b"]`
- **THEN** its stored chain remains `["a", "b"]` and its message trace contains `a`, `b`, and the
  repeated `a` in order
- **THEN** its message is `Circular dependency detected: a → b → a`, following
  `Circular dependency detected: <trace>` with spaces around U+2192 and the repeated key appended
- **THEN** the stored chain excludes that appended occurrence unless already present in its supplied
  input

### Requirement: Synchronous reentry detection

`CircularDetector` SHALL track keys currently resolving through that detector in insertion order and
throw `CircularDependencyError` when a key reenters before its earlier call returns. It SHALL provide
the active key sequence as the error chain and remove each active key in `finally`, whether resolution
succeeds or throws.

#### Scenario: Detect an indirect cycle

- **WHEN** definitions resolve `a` to `b` to `c` to `a` through the detector
- **THEN** resolution throws `CircularDependencyError` for `a` with active chain `["a", "b", "c"]`

#### Scenario: Clean up after a successful resolution

- **WHEN** a resolution finishes normally and the same key is later resolved independently
- **THEN** the previous call does not remain marked as active

#### Scenario: Clean up after a failure

- **WHEN** a resolution throws and the same key is later resolved independently
- **THEN** an acyclic `a` to `b` chain can complete normally without the prior failure interfering

#### Scenario: Forward detector metadata

- **WHEN** the caller queries `has` or `keys` on the detector
- **THEN** `has` and available `keys` forward to the inner container, with `keys()` returning `[]`
  when enumeration is absent

### Requirement: Bootstrap composition and lookup

`bootstrap(providers, additionalContainers = [])` SHALL compose providers before any resolution.
Additional containers take priority over provider-defined keys. Provider definitions and extensions
receive a reference to the full application container so they can resolve any key, including those from
additional containers. The internal arrangement of decorators is an implementation detail.

#### Scenario: Additional container takes priority

- **WHEN** both an additional container and the providers supply `k`
- **THEN** the additional container's value wins and is cached by the application container

#### Scenario: Provider callback resolves from additional containers

- **WHEN** a provider definition calls its supplied container to resolve a key supplied only by an
  additional container
- **THEN** the definition receives that key's value through its proxy

### Requirement: Bootstrap caching and cycle detection

The container returned by `bootstrap` SHALL cache each resolved value so subsequent resolves return the
first result without re-invoking the definition. A direct or indirect circular dependency among
provider keys SHALL throw `CircularDependencyError` on first resolution. Bootstrap itself SHALL return
without resolving any key eagerly.

#### Scenario: Detect a provider cycle lazily

- **WHEN** providers contain `a` to `b` to `a`
- **THEN** bootstrap itself returns without resolving them
- **THEN** resolving `a` through the application container throws `CircularDependencyError`

### Requirement: Bootstrap provenance service

Bootstrap SHALL install a definition for `app/provenance` returning the composed provenance map,
replacing any provider definition under that key after composition. Existing extensions for the key
SHALL still apply, and an additional container reporting the key SHALL still take priority. Installing
the definition SHALL not add a synthetic provenance entry or alter already recorded provider
contribution histories.

#### Scenario: Resolve composition history

- **WHEN** `A` then `B` define `key` and the bootstrapped `app/provenance` service is resolved
  without an override or extension
- **THEN** it returns a map whose `key` entry reports `definedBy: ["A", "B"]`
- **THEN** `app/provenance` is enumerable as a container key, but has no provenance entry unless a
  provider originally contributed that key

#### Scenario: Replace a contributed provenance definition

- **WHEN** a provider defines `app/provenance` and no additional container overrides it
- **THEN** bootstrap replaces that definition with its map-returning definition while retaining the
  original contribution's provenance and extensions
