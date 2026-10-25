# @uny/di Design

Status: intended package contract under review. Existing code is a prototype to reconcile with this specification; this document does not claim that the described API is implemented.

`@uny/di` provides the small composition primitives used by Uny. Package-specific DI behavior belongs here rather than in the root application architecture.

## Principles

- A provider is configuration: keyed definitions and extensions, with no lifecycle.
- Definitions are lazy recipes for values.
- Later definitions replace earlier definitions for the same key.
- Extensions compose in provider order and apply to the final winning definition, including extensions contributed before that definition.
- Normal composition retains only effective definitions and extension chains; overridden definitions have no runtime effect and need not survive.
- Runtime containers retrieve values; they do not enumerate provider configuration or expose composition history.
- Composition history and dependency graphs are opt-in inspection concerns.
- Richer consumers depend on richer interfaces instead of expanding the minimal container contract.

## Core Types

The intended minimal interfaces are:

```ts
type Definition<T = unknown> = (container: Container) => T;

type Extension<T = unknown> = (
  previous: T | undefined,
  container: Container,
) => T;

interface Provider {
  definitions?: Record<string, Definition>;
  extensions?: Record<string, Extension>;
}

interface Container {
  get<T = unknown>(key: string): T;
  has(key: string): boolean;
}
```

`get()` is intentional and conventional. It does not expose whether a value was constructed, cached, delegated, generated, or loaded externally.

`has()` is required by an efficient `CompositeContainer`, which must select a source before calling `get()`.

The container does not expose `keys()`. A container may support generated, remote, prefixed, or otherwise non-enumerable key spaces. Declared keys belong to providers and composition inspection, not ordinary runtime consumers.

## Composition

A composer accepts an ordered map of named providers and returns another provider. A composed provider can therefore participate in later composition like any other provider.

```ts
const composed = composeProviders(new Map([
  ["base", baseProvider],
  ["feature", featureProvider],
  ["project", projectProvider],
]));
```

Definitions use deterministic last-wins replacement. Earlier definitions do not survive normal composition.

Extensions form one ordered callable chain and apply to the winning definition independently of where that definition appears in provider order:

```text
provider A: define service
provider B: extend service
provider C: redefine service

effective result: provider B extension(provider C definition)
```

This behavior is intentional and emergent from separately composing the winning definition and ordered extension chain.

Provider-map entries are contributions, not object identities. Registering the same provider under two names contributes it twice.

Additional containers used by bootstrap are already-resolved sources, not provider overrides. If an override must participate in extension composition, it should be represented as a later provider.

## Dependency Metadata

Dependency metadata describes a contribution itself. It does not know which provider contributes it, which key it is assigned to, or whether it wins composition.

Definitions and extensions share one metadata capability:

```ts
interface DependencyAware {
  getDependencies(): readonly string[];
}

type DependencyAwareDefinition<T = unknown> =
  Definition<T> & DependencyAware;

type DependencyAwareExtension<T = unknown> =
  Extension<T> & DependencyAware;
```

Helpers should expose dependency metadata without resolving values:

- `factory(dependencies, callback)`
- `construct(Class, dependencies)`
- `value(value)`
- `alias(key)`
- A dependency-aware extension helper

Raw callables remain valid and have unknown static dependencies.

### Immutable Dependency Transformation

Helper-created contributions may additionally support immutable dependency transformation:

```ts
interface DependencyTransformable<T> extends DependencyAware {
  withDependencies(keys: readonly string[]): T;
}

const next = definition.withDependencies(["db", "logger"]);

next !== definition;
```

`withDependencies()` returns a new contribution and leaves the original unchanged. For factories, constructors, and dependency-aware extensions, changing dependencies must change both metadata and runtime resolution behavior.

Opaque definitions that call `container.get()` directly cannot safely rewrite their behavior from metadata alone. They may be dependency-aware, but they are not automatically dependency-transformable.

This distinction permits provider-tree walkers to produce a different immutable tree without mutating the existing one or claiming that annotation alone rewrites arbitrary closures.

## Containers

Container capabilities remain separate and composable:

- `DelegatingContainer` evaluates definitions and extension chains from a provider.
- `CachingContainer` caches values returned by another container.
- `ProxyContainer` closes the bootstrap delegation loop.
- `CompositeContainer` selects the first child whose `has()` returns true.
- `CircularDetector` decorates a container and reports recursive lookups.

Definitions receive the final application container through bootstrap delegation so they can depend on keys supplied by other sources without coupling provider composition to those sources.

## Composition Inspection

Normal composition performs no provenance collection and exposes no `app/provenance` service. Inspection observes the original ordered provider map only when explicitly enabled.

A composition logger records cheap, JSON-safe facts as contributions are encountered:

```ts
interface CompositionLogEntry {
  schema: "uny.composition/v1";
  compositionId: string;
  sequence: number;
  provider: string;
  providerIndex: number;
  key: string;
  kind: "definition" | "extension";
  dependencies: readonly string[] | null;
}
```

The natural persistent representation is NDJSON: one immutable entry per line. A logger can be introduced by decorating the composer only for `inspect`, an explicit dump mode, or an application configured to retain composition logs.

Offline tooling can derive:

- Every definition contributed for a key.
- Which provider contribution replaced which.
- The effective definition.
- Extension application order.
- The facts needed to construct historical and effective dependency graphs.

Analysis is separate from logging. Normal execution pays no graph-analysis cost, and overridden definitions do not survive in the composed provider.

### Tradeoffs

- Override history cannot be reconstructed after composition unless the original providers or a composition log remain available.
- Enabled logging adds a linear traversal, entry creation, and sink I/O. It is cheap for ordinary provider maps but not free.
- Logs expose provider names, keys, and dependency structure and may therefore contain sensitive diagnostics.
- Persistent logs require a versioned schema and composition identifier.
- Function bodies are not serialized. Stable provider name, key, contribution order, kind, and declared dependencies identify a contribution.

## Debugging Conveniences

Diagnostic tools consume a provider map or composition log, not a more powerful runtime container.

`uny inspect` should provide:

- A compact human view showing the winner, override path, and extension order.
- Machine output retaining all contribution and dependency facts.
- A raw NDJSON dump suitable for offline graph and provenance analysis.

Graph walkers and alternative analyzers operate on immutable logs or provider trees and produce new results; they do not mutate the runtime container.
