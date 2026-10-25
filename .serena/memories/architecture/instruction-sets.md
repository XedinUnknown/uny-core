# Instruction Sets and Target Adapters

## The layering

Core is domain-agnostic. Domain knowledge lives entirely in swappable providers.

```
input (feature file | stdin | argv)
  → parser            keyword stripping, sentence extraction   [domain-agnostic]
  → instruction registry   list service, populated by extensions
  → resolver          expression match → handler + args         [domain-agnostic]
  → runner            execute with context                      [domain-agnostic]
      ├─ target adapter        the subject under control        [DOMAIN]
      ├─ visible surface       what is rendered right now       [DOMAIN]
      └─ subject state         broader queryable facts          [DOMAIN]
  → sinks             human / NDJSON / report                   [domain-agnostic]
```

## What is core vs what is a set

**Core, never domain-specific:**
- Persistent connection lifecycle: create / attach / liveness check / recover-on-death.
  Invariant is "a live handle to the subject that outlives the process invocation".
- Expression matching (`{string}`, `{word}`, `{int}`, `/regex/`). Never knew about mobile.
- Reset as *named* semantics (`hard` / `soft` / `none`). Core defines the names; the adapter
  decides what each means (clear app data vs reload a save).
- Locking, verbosity, output sinks, exit codes.

**Instruction set provider contributes:**
- Handlers appended to the instruction registry via list-service extensions.
- A target adapter definition.
- Optionally: visible-surface and state observation implementations, selector/query builders,
  domain reset semantics.

## Generic slots vs current instances

`device/*` and `screen/*` are **mobile instances of generic slots**, not core vocabulary.

- `device/*` → instance of **target adapter**.
- `screen/*` → instance of **visible surface** observation.

Visible surface and subject state are **two distinct slots**, not one. Mobile collapses them
because the screen largely is the observable surface. Other domains separate them cleanly:
a game has a viewport *and* queryable world state that is not on screen. Do not force a
domain adapter to model its state as a screen.

## Adding a domain

Add a provider. Do not modify core. Removing a domain = do not include its provider.
This add/remove-without-core-change property is the reason the six primitives were chosen;
see `mem:architecture/composition`.

Intended sets:
- **Appium/WDIO** — mobile. First target. Android first, iOS stubbed.
- **Games** — e.g. RimWorld via a GABP/GABS-style bridge. Structured English instructions
  driving scenarios; same runner, different adapter and instruction set.

## Naming already anticipated this

The planned package split `@uny/steps` (core primitives) vs `@uny/steps-mobile`
(42 mobile patterns, external package) is correct and should be preserved. The catalog was
right; only the framing was narrower than the design.
