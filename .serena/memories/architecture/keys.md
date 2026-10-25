# Key Namespace

Keys **are** the application semantics. Adding a key is an architectural act, not plumbing.
This memory states the *rule*, not a fixed vocabulary — no specific prefix list here is settled.

## The rule

Keys are path-like, forward-slash separated, and namespaced to avoid collisions. A namespace
must be classifiable as one of:

- **Core vocabulary** — meaningful regardless of which instruction set or target is active.
- **A domain-instance slot** — a generic concept (target adapter, visible surface, subject
  state — see `mem:architecture/instruction-sets`) as instantiated by one specific domain.

Only `app/*` (app identity, paths, environment) is settled core vocabulary. Everything else —
session, config, locking, steps, output, and any domain namespace — is a candidate shape, not
a decision. The founding plan proposes one concrete namespace set as an illustration; treat it
as an example of the pattern, not as this specification.

## The `config/` caveat

Wherever a namespace plays this role: everything in the container is configuration in the broad
sense, but a dedicated namespace for *user-facing configuration resolution* — the layered merge
of defaults, file, and CLI into one validated object — must be distinguishable from the services
that merely *consume* that config. Do not let "settings" and "resolution pipeline" share a prefix.

## List services

See the list-service pattern in `mem:architecture/composition`. Where a key aggregates
contributions from multiple providers (a registry), that key holds an array and providers
append via extensions, never by redefining — this is what makes a contribution additive
instead of destructive.

## Platform/domain registration pattern

Domain providers are **always loaded**; they do not gate on config. Each registers its code
into a list-service registry and contributes an entry key for its concrete implementation. A
factory resolves the configured code against registered entries.

Consequences: no conditional provider loading, and the registry doubles as validation
("is this domain supported?"). Apply this pattern uniformly to instruction sets.
