# Composition

`packages/di/README.md` is the intended package contract under design review. The existing DI code is a prototype to reconcile before WORK-2 is accepted.

## Intended primitives

1. Keyed lazy definitions.
2. Extensions over a key's previous value.
3. Deterministic host-specified provider order.
4. Last definition wins.
5. All extensions chain in provider order and apply to the final winning definition, even when contributed before it.
6. One immutable composed provider/container at runtime.

A provider is inert configuration (definitions + extensions), with no lifecycle. The host owns naming, ordering, selection, composition, and platform bridges.

## Intended runtime interfaces

- `Container.get(key)` retrieves a value.
- `Container.has(key)` supports efficient composite lookup.
- Containers do not enumerate keys; key declaration belongs to providers.
- The composer returns a provider, so composed providers can be composed again.
- Normal composition retains only effective definitions and extension chains.

## Dependency metadata

Definitions and extensions share one `DependencyAware` capability. Helper-created contributions may additionally provide immutable `withDependencies()` transformations that change both metadata and runtime dependency resolution. Raw closures may remain opaque and are not automatically transformable.

## Inspection

Provenance is not a container service. Inspection decorates composition only when requested and emits a versioned, JSON-safe NDJSON contribution log. Offline tools derive winners, override order, extension order, and graph inputs from that immutable log. Normal execution retains no override history or graph-analysis state.

