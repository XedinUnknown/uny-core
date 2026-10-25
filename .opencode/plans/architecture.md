# Uny Architecture

Status: normative design for unimplemented behavior.

This document defines intended system boundaries and invariants. While behavior is being designed, accepted planning intent is authoritative and existing code is a prototype to reconcile against it. Delivery order and current status live in [implementation-plan.md](implementation-plan.md).

## Product

Uny is an exploration-first structured-language instruction runner over a persistent connection to a controllable subject. Mobile application testing through Appium and WebDriverIO is the first instruction set, not a permanent restriction on the core.

The defining property is continuity across separate CLI invocations. A developer or agent can issue one instruction, inspect the result, and issue another without rebuilding the application runtime or reconnecting to the subject each time. Traditional suites and feature files are supported as batches over the same execution engine.

Primary consumers:

- Developers exploring and debugging flows.
- AI agents controlling and observing a subject incrementally.
- CI jobs executing deterministic feature files.

## Goals

- Fast repeated instructions against a warm runtime and live subject connection.
- Structured English through a useful subset of Gherkin plus raw instructions.
- Domain-neutral parsing, matching, execution, and output pipelines.
- Swappable instruction sets and target adapters contributed through providers.
- Human-readable and machine-readable incremental output.
- Deterministic composition, diagnostics, recovery, and testability.

## Non-Goals

- Full Cucumber runtime or matcher compatibility.
- General natural-language understanding.
- Concurrent manipulation of one subject connection.
- Cross-machine sharing of local hosts or sessions in the first version.
- A default interactive REPL.
- iOS implementation in the first mobile release.

## Command Model

`run` is explicit but optional:

```bash
uny run 'click "Login"'
uny <<< 'click "Login"'
printf '%s\n' 'click "Login"' 'see "Welcome"' | uny
uny run tests/features/login.feature
```

The default command behavior is deterministic:

- Instruction arguments select implicit execution.
- Non-TTY stdin is consumed as an instruction stream.
- TTY stdin with no instruction prints usage and exits.

Management and inspection remain explicit commands:

```bash
uny inspect [key]
uny tree
uny screenshot
uny reset [mode]
uny host start|list|status|restart|stop [name]
```

## Named Persistent Hosts

Normal `uny` invocations are short-lived clients. A named local host is a persistent Node.js process that owns:

- One immutable composed container.
- Loaded providers, instruction handlers, and compiled matchers.
- One serialized request queue.
- One target adapter and live subject connection.
- For mobile, one WebDriverIO browser object and Appium session.
- WebDriverIO custom commands registered for the host lifetime.
- One lease on the selected physical device or emulator.

The first implementation maps one host to one device. Multiple devices use multiple named hosts. Host identity and device identity remain separate so the same device profile can be addressed by differently configured hosts at different times without conflating process and hardware identity.

### Coordinated Subjects

Multiple devices can participate in one scenario without allowing concurrent commands against one host. A scenario-runner client coordinates the selected hosts for the duration of the run: it routes commands, correlates observations, and applies barriers and timeouts.

Appium/WebDriverIO does not provide a portable stream of application-domain events. Initial coordination therefore reacts to detected state changes:

1. Execute an action on subject A.
2. Observe subject B repeatedly or after relevant command completions.
3. Normalize observations into domain facts.
4. Continue when a predicate becomes true or fail on timeout.

The application or its backend provides the actual communication between devices; Uny drives and observes each endpoint. Target adapters may later expose push observations, logs, or domain events through the same normalized observation interface, so orchestration does not depend on polling versus push delivery.

Coordination requires independently addressable hosts, one device lease per host, correlation IDs, monotonic observation ordering per host, configurable polling/backoff, eventual-consistency timeouts, and diagnostics retaining each participant's timeline. No synchronized clock or total cross-host ordering is assumed.

### Selection

Host selection uses this precedence:

1. `--host <name>`
2. `UNY_HOST`
3. Project `defaultHost`
4. `default`

Examples:

```bash
uny --host pixel-8 <<< 'click "Login"'
UNY_HOST=pixel-8 uny <<< 'see "Welcome"'
```

A missing selected host may be started on demand. Explicit `uny host start` remains available for diagnostics and automation.

### Local Transport

Clients address hosts through project-scoped Unix-domain sockets. Windows uses the named-pipe equivalent. The protocol is framed NDJSON with request IDs and incremental events:

```json
{"id":"42","type":"run","input":"click \"Login\"","options":{"reset":"none"}}
{"id":"42","type":"step.started","text":"click \"Login\""}
{"id":"42","type":"step.finished","status":"passed","durationMs":184}
{"id":"42","type":"run.finished","status":"passed"}
```

The protocol supports progress, diagnostics, attachments, completion, and cancellation. Containers, service objects, and WebDriverIO objects never cross the transport boundary.

### Runtime State

Project runtime state is namespaced by validated host name:

```text
.uny/hosts/<host-name>/runtime.sock
.uny/hosts/<host-name>/host.json
.uny/hosts/<host-name>/host.lock
.uny/hosts/<host-name>/session.json
```

`host.json` records the host PID, endpoint, start time, config fingerprint, device identity, and current session ID. Endpoint permissions are restricted to the current user.

Each host executes one request at a time. Initial policy may queue or return a busy result. A separate device lease prevents two live hosts from claiming the same device. Stale PID, endpoint, lock, lease, and session metadata must be detected and recovered safely.

### Immutable Composition

The host container is immutable after bootstrap. Its fingerprint covers the Uny version, project configuration, selected providers, relevant startup environment, target profile, and capabilities. A fingerprint mismatch causes a clean host restart and recomposition; live services are never mutated in place.

## Option Scopes

CLI options have three distinct scopes:

| Scope | Examples | Behavior |
|---|---|---|
| Host startup | provider selection, target profile, capabilities | Final override provider; included in host fingerprint |
| Request | reset mode, new session, continue-on-error | Sent with one execution request; does not recompose the host |
| Client presentation | output format, verbosity | Applied by the short-lived client while rendering host events |

This separation prevents ordinary commands from restarting or mutating a warm host.

## Config-Based Modularity

Uny uses provider composition for application wiring. The application host selects, names, orders, composes, and bridges providers; feature selection happens through provider inclusion rather than scattered runtime flags.

The intended DI primitives, container interfaces, dependency transformation, and opt-in composition-log model are specified in [`packages/di/README.md`](../../packages/di/README.md). Package-specific DI semantics live with the package rather than being duplicated here.

### Project Configuration

Configuration may come from any number of sources because each source contributes a provider or container to the same ordered composition. Sources may include code, `uny.config.js`, environment values, CLI startup overrides, persisted settings, remote configuration, test overrides, and declarative formats such as NEON.

The requirement is one deterministic composition and precedence model, not one configuration format. A NEON adapter, for example, parses declarative data into provider definitions and then participates in ordinary composition rather than introducing a separate lookup system.

`uny.config.js` or `uny.config.mjs` currently customizes provider composition. Its default export is either:

- A provider-map transform that receives a copy and returns the authoritative map.
- A plain provider appended as user configuration sugar.

Transforms may insert, replace, reorder, or remove providers. Composition-affecting host-startup overrides are appended last. Missing required keys fail before runtime execution.

Declarative sources may validate their own syntax and schema, but their output still becomes ordinary composed configuration.

## Layering

The domain-neutral pipeline is:

```text
argv | stdin | feature file
  -> parser
  -> instruction registry
  -> resolver
  -> runner
      -> target adapter
      -> visible-surface observer
      -> subject-state observer
  -> event sinks
```

Core owns parsing infrastructure, matching, execution, connection lifecycle, request policy, output events, and diagnostics. An instruction-set provider contributes handlers and domain bindings. A target adapter controls and observes one subject.

Mobile maps these generic slots as follows:

- Appium/WebDriverIO is the target adapter.
- `device/*` is the mobile target-control namespace.
- `screen/*` is the mobile visible-surface namespace.
- Android is the first concrete platform; iOS is initially a stub.

Visible surface and broader subject state remain distinct contracts. Other domains, such as games, must be addable by composing providers without modifying core.

## Parsing and Matching

The parser consumes a useful Gherkin subset as a stream of events:

- Feature, Rule where adopted, Scenario, and Scenario Outline structure.
- Given, When, Then, And, and But steps.
- Keywordless raw instructions.
- Optional leading `I` in step text.
- Doc strings and data tables.
- Deterministic structure start/end events.
- Scenario examples expansion where required by the supported outline subset.

The resolver uses a custom expression engine with `{string}`, `{word}`, `{int}`, and explicit regular-expression patterns. It must report no-match and ambiguous-match failures with candidate provenance. Cucumber's matcher is not used.

The parser and Cucumber Messages schema are independent decisions from the matcher. Before implementing the parser, decide whether to use `@cucumber/gherkin` for AST and pickle compilation while retaining Uny's resolver.

`@uny/steps` contains only domain-neutral registry, resolver, runner, hooks, and context infrastructure. Mobile actions belong in an external `@uny/steps-mobile` provider that extends the instruction registry.

## Mobile Behavior

The initial mobile instruction set covers interaction, observation, navigation, waits, screenshots, and hooks. User-visible references are resolved through ordered strategies rather than exposing backend selectors as the primary interface.

Click discovery uses preferred interactive/accessibility matches before a broader fallback. Input discovery uses, in order:

1. Semantic editable-field attributes.
2. Spatial relation between labels and editable fields.
3. Direct editable-field selectors.
4. A controlled fallback.

Spatial matching is deterministic and testable. The founding heuristic is `max(verticalGap, 0) + horizontalOffset * 0.2`, with distant candidates rejected rather than guessed.

Step handlers depend on platform-neutral contracts. Appium, WebDriverIO, ADB, Docker, and Android capability details remain behind host-owned adapters.

### Virtual Browser Instructions

As much single-target behavior as practical should be registered on the long-lived WebDriverIO browser or element interfaces as semantic custom commands. Parsing, matching, reporting, and multi-host orchestration remain outside the browser.

This affords one-time registration per warm browser wrapper, consistent waits/retries/discovery/error normalization, a shared semantic operation surface across device hosts, and concentrated instrumentation around meaningful target operations.

An instruction is exportable to the virtual browser when it:

- Operates on exactly one target/session.
- Has explicit host-resolvable dependencies.
- Accepts and returns structured serializable data.
- Defines timeout, cancellation, and capability requirements.
- Retains no stale element handles across calls.
- Can be re-registered after browser-wrapper or session recreation.
- Emits structured progress and diagnostic events.
- Uses a namespaced command with collision and TypeScript-augmentation policy.
- Is independently mock-testable.

`browser.addCommand()` executes in the persistent Node host. It avoids repeated Uny/client setup but does not eliminate the WebDriver/Appium round trips made by commands inside it. `browser.execute()` is a different mechanism limited to applicable web or WebView execution contexts and is not a general native-mobile instruction transport.

## Connection and Reset Lifecycle

The target connection supports create, attach, liveness check, close, and recovery. For WebDriverIO/Appium:

1. Reuse the in-memory browser object while the host is alive.
2. After host restart, attach from per-host session metadata when valid.
3. Create a new session when no valid session exists.
4. On a recognized session-death error, recreate and retry one step once.

Death patterns are a composable list service rather than hard-coded control flow.

Reset names are domain-neutral; adapters define their effects. Initial mobile semantics are:

| Mode | Mobile behavior |
|---|---|
| `none` | Preserve current app and device state |
| `soft` | Close and reopen the app |
| `hard` | Restart the device, then open the app |
| `wipe` | Hard reset, clear app state, and reinstall as required |

Stopping a host, deleting an Appium session, resetting the app, and restarting a device are separate operations.

## Output and Reporting

Execution produces structured events. Independent sinks consume them for:

- TTY-aware human progress.
- Plain non-TTY output.
- General NDJSON logs.
- Standard report formats.

Parseable results go to stdout; diagnostics go to stderr. Verbosity controls diagnostic detail from silent through raw trace without changing execution semantics.

Cucumber Messages is the preferred standards-compatible report candidate, not a commitment to Cucumber's matcher or runner. A valid report requires the linked source, Gherkin document, pickle, test case, test-case-started, and step events; isolated pass/fail envelopes are insufficient. Using `@cucumber/gherkin` would make faithful source/document/pickle envelopes substantially cheaper. This decision must be resolved before parser implementation.

Attachments such as screenshots and trees are emitted as correlated events and may be consumed by multiple sinks concurrently.

### Event-Derived Human Interface

The append-only execution event stream is the source for human presentation as well as machine sinks. A human client reduces events into a retained view model, analogous to SAX events constructing and updating a DOM, and renders that model for a terminal or richer UI.

Stable run, scenario, instruction, and attachment IDs allow later events to update one displayed instruction:

```text
step.started     -> create a running step node
step.progress    -> append detail
attachment.added -> add a screenshot or tree
step.finished    -> change the node to passed or failed
```

Past log entries remain immutable. The UI changes because its reducer applies later events, not because history is rewritten. Late attachments and diagnostics may enrich a completed step; status changes must follow an explicit state machine.

TTY renderers may redraw existing rows, while non-TTY renderers append stable lines. Replaying the same NDJSON stream must reconstruct the same view state. Event schemas therefore require versioning, correlation IDs, per-stream monotonic sequence numbers, idempotent reducers, backpressure, cancellation, and a snapshot/resume strategy for long streams.

Composition logs and execution logs are separate versioned NDJSON protocols even when they share sink infrastructure.

## Package Boundaries

Implemented packages:

| Package | Responsibility |
|---|---|
| `@uny/di` | Composition primitives and container implementation; intended contract documented in its package README |
| `@uny/core` | Basic application configuration and derived paths |
| `@uny/cli` | Current executable/configuration/inspect foundation; evolves into thin client plus host entrypoints |

Planned boundaries:

| Package | Responsibility |
|---|---|
| `@uny/host` | Named-host registry, local transport, queue, fingerprint, and device leases |
| `@uny/session` | Per-host connection persistence, recovery, and reset orchestration |
| `@uny/logging` | Event sinks and formatters |
| `@uny/steps` | Domain-neutral parsing/matching/execution infrastructure |
| `@uny/steps-mobile` | Mobile instruction handlers |
| `@uny/device-android` | Android target adapter and capabilities |
| `@uny/screen` | Mobile visible-surface parsing and element discovery |
| `@uny/testing` | Shared production-bootstrap test harness and fakes |

Package boundaries may be combined when implementation proves a split has no independent value. Provider and key boundaries are more important than package count.

## Testing Invariants

- Develop user-visible behavior test-first.
- Tests execute against compiled package exports.
- Use the production bootstrap with a final test override provider.
- Mock WebDriverIO and target boundaries for fast functional tests.
- Test provider order, replacement, extension chaining, dependency transformation, opt-in composition logs, missing keys, aliases, caching, and circular dependencies.
- Test explicit and implicit execution, non-TTY stdin, named-host selection, auto-start, handshake, queueing, device leases, stale-state recovery, fingerprint restart, and session reattachment.
- Test every output sink from the same execution events.
- Defer real-device automation until the mocked cross-package path is complete, then document and run focused smoke tests.

## Technology and Distribution

- TypeScript in strict ESM mode on Node.js 22 or newer.
- pnpm workspaces, Lerna independent versioning, Nx task orchestration/cache, and tsup builds.
- `node:test`, `node:assert/strict`, tsx, and execa for tests.
- WebDriverIO and Appium for the first target adapter.
- No third-party DI framework.
- Docker development, builder, and runtime stages.
- Docker delivery supports bind-mounted development, derived CI images, and Compose usage.

The package registry target remains an implementation decision. npm-compatible installation and the `uny` binary are required regardless of registry.

## Extensibility

The architecture must permit these without core changes:

- Record/replay as runner extensions and event consumers.
- Element locking and auto-healing as resolver extensions.
- An explicitly requested `uny repl` provider, if later justified.
- Additional report sinks.
- New instruction sets and target adapters.
- Debug providers that wrap services through ordinary extensions.

## Open Decisions

Resolve these in [implementation-plan.md](implementation-plan.md) before their dependent work begins:

- Canonical executable entrypoint and removal of the duplicate root skeleton.
- Which declarative configuration sources to ship first, including whether to trial NEON and where schema validation belongs.
- `@cucumber/gherkin` adoption and Cucumber Messages output scope.
- Queue versus immediate busy behavior as the default request policy.
- Commander.js adoption versus retaining the current parser.
- Package publication registry and release policy.
