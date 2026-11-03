# Uny Implementation Plan

Status: current delivery source of truth as of 2026-10-24.

This document tracks prototype reality, delivery order, and acceptance criteria. Intended behavior and system boundaries live in [architecture.md](architecture.md) and package design documents. Existing implementation is evidence, not authority, while a component remains under design review.

## Current State

| Area | Status | Evidence or remaining gap |
|---|---|---|
| `@uny/di` | Prototype under design review | Composition and container code exists; reconcile it with `packages/di/README.md` before accepting WORK-2 |
| `@uny/core` | Implemented | Core provider and tests exist |
| Build pipeline | Implemented | pnpm, Lerna, Nx, tsup, package exports, and CI test/release workflows exist |
| `@uny/cli` foundation | Partial | Help, inspect, config loading, provider transforms, and errors largely work |
| Canonical executable | Blocked on decision | Package binary works directly; workspace `pnpm exec uny` and root skeleton need normalization |
| Docker runtime | Largely implemented | Multi-stage image, Compose service, and image workflow exist; packaging/release path remains |
| AI tooling | Mostly implemented | Agent configuration and Serena stdio setup exist |
| Logging/event layer | Not started | Only planning exists |
| Parser and instruction runner | Not started | Only planning exists |
| Host/session runtime | Not started | Named host, transport, queue, leases, and persistence are planned |
| Device and screen adapters | Not started | Appium/WDIO, Android, discovery, and inspection are planned |

Historical test counts are not treated as current verification. Run the documented repository commands before closing implementation work.

## Delivery Order

```text
Foundation
  WORK-2 DI composition [prototype; reconcile specification]
    -> WORK-3 executable application entrypoint
       -> WORK-4 project configuration
       -> WORK-5 CLI option scopes
       -> WORK-6 output, logging, diagnostics

Language
  WORK-3 -> WORK-7 Gherkin event parser
  WORK-7 -> WORK-8 instruction registry and matching
  WORK-6 + WORK-7 + WORK-8 -> WORK-9 streaming execution

Target
  WORK-3 -> WORK-10 platform-neutral target layer
  WORK-10 -> WORK-11 Appium/WebDriverIO adapter
  WORK-11 -> WORK-12 Android support
  WORK-9 + WORK-11 + WORK-12 -> WORK-13 named hosts, sessions, resets

Behavior
  WORK-12 -> WORK-14 element discovery
  WORK-8 + WORK-14 -> WORK-15 interaction instructions
  WORK-6 + WORK-8 + WORK-14 -> WORK-16 assertions

Inspection
  WORK-6 + WORK-12 -> WORK-17 tree, screenshot, and metrics

Delivery
  WORK-3 -> WORK-18 npm-compatible package
  WORK-18 -> WORK-19 Docker runtime
  WORK-18 + WORK-19 -> WORK-20 CI/CD

Independent
  WORK-21 AI tooling
  WORK-22 documentation and provenance
```

The dependency order above is the delivery authority. In particular, named persistent hosts follow a working streaming executor and target adapter; the host transport must not be developed around speculative executor interfaces.

## Work Items

### WORK-2: DI Composition

Status: prototype exists; reconcile and validate before accepting.

The intended contract is [`packages/di/README.md`](../../packages/di/README.md).

Acceptance:

- The minimal container exposes `get()` and `has()` but no key enumeration.
- Provider composition returns a provider and retains only effective definitions and extension chains.
- Extensions apply in provider order to the final winning definition, including extensions contributed before it.
- Definitions and extensions share one dependency-metadata capability.
- Helper-created contributions may implement immutable `withDependencies()` transformations that change both metadata and runtime dependency resolution.
- Opaque closures are not claimed to be dependency-transformable.
- Normal composition retains no override history and injects no provenance service into the container.
- Opt-in composition logging emits versioned JSON-safe/NDJSON contribution facts only when inspection or dumping is enabled.
- Offline tooling derives winners, override order, extension order, and graph inputs from the log.
- Delegating, caching, proxy, composite, and circular-detection behaviors remain independently testable.

### WORK-3: Executable Application Entrypoint

Status: partial; immediate focus.

Deliver one canonical executable path that can bootstrap a provider map and dispatch initial commands.

Requirements:

- Decide between the package entrypoint and root skeleton; remove or delegate the loser.
- Make workspace-local execution mirror installed execution.
- Keep the executable wrapper to a shebang and one imported call.
- Retain `--help`, human inspect, machine inspect/composition-log output, stable exit codes, and clear bootstrap errors.
- Keep Gherkin, mobile automation, and persistent hosts out of this ticket.

Acceptance:

- Documented build and tests pass.
- `pnpm exec uny --help`, or one explicitly documented workspace equivalent, works.
- `uny inspect` and `uny inspect --format json` work through the canonical entrypoint.
- Unknown commands and missing required keys fail clearly.
- No duplicate config loader or executable implementation remains.

### WORK-4: Project Configuration and Provider Loading

Status: largely implemented; verify and close after WORK-3.

Requirements:

- Discover `uny.config.js` or `uny.config.mjs` from the project directory.
- Support `--project-dir` and `UNY_PROJECT_DIR`.
- Import ESM config through file URLs.
- Accept a provider-map transform or plain provider.
- Give transforms a copy and use their returned map as authoritative.
- Preserve deterministic insertion, replacement, reorder, and removal behavior.
- Permit additional configuration adapters, including declarative sources such as NEON, to produce ordinary providers or containers with explicit precedence.
- Validate required keys after transformation.

Acceptance:

- Existing loader fixtures and tests pass against the canonical entrypoint.
- Invalid exports name the file and accepted shapes.
- Provider position, override history, extension order, and declared dependencies are observable through inspect without resolving services.

### WORK-5: CLI Option Scopes

Status: partial.

Requirements:

- Classify every option as host-startup, request, or client-presentation scope.
- Add `--host <name>` and preserve `--project-dir`, format, verbosity, quiet, and help behavior.
- Use a final host-startup override provider only for composition-affecting options.
- Include startup overrides in the future host fingerprint.
- Keep reset and error policy in requests.
- Keep output format and verbosity client-side where practical.
- Treat `inspect` as the temporary default until implicit execution arrives in WORK-9.

Acceptance:

- Precedence and composition-inspection tests cover startup overrides.
- Presentation flags do not alter immutable host composition.
- Unknown or malformed flags fail clearly.

### WORK-6: Output, Logging, and Diagnostics

Status: not started.

Build one append-only structured execution-event model with independent human, NDJSON, and report sinks. Human presentation consumes the same event stream through a reducer that maintains a renderable view model.

Acceptance:

- Human and machine sinks consume the same events.
- Parseable results use stdout and diagnostics use stderr.
- Errors and attachments are correlated to runs and instructions.
- Verbosity changes diagnostics without changing behavior.
- Inspect uses shared output facilities where appropriate.
- Stable IDs and per-stream sequence numbers let progress, attachments, and completion events update one rendered instruction without rewriting the log.
- TTY redraw and non-TTY append-only renderers reduce the same events.
- Replaying an NDJSON stream reconstructs the same view state through an idempotent reducer.
- Composition and execution logs remain separate versioned protocols even if they share sink infrastructure.

Before implementation, resolve the Cucumber Messages decision described in [architecture.md](architecture.md#output-and-reporting).

### WORK-7: Gherkin Event Parser

Status: not started.

Implement a streaming parser for the supported Gherkin subset, including structure events, doc strings, tables, keywordless instructions, and optional leading `I`.

Acceptance:

- Feature, Scenario, Scenario Outline, and step start/end events are deterministic.
- Multiline input, doc strings, tables, examples, and parse failures are covered.
- Files and stdin use the same parser path.
- The parser decision accounts for Cucumber AST/pickle/report compatibility without adopting Cucumber matching.

### WORK-8: Instruction Registry and Matching

Status: not started.

Implement the domain-neutral registry, expression matcher, resolver, hooks, context, and runner infrastructure.

Acceptance:

- Providers extend the registry through a list-service key.
- `{string}`, `{word}`, `{int}`, and explicit regular expressions extract arguments deterministically.
- No-match and ambiguous-match errors include original text and candidate provenance.
- Concrete mobile instructions remain outside the core package.

### WORK-9: Streaming Execution

Status: not started.

Connect input events to matching, execution, and output incrementally.

Acceptance:

- `uny run ...` and implicit `uny ...` share one path.
- Direct instruction arguments, multiline stdin, and piped feature files work.
- TTY invocation without input prints usage and exits without a prompt.
- Error stop/continue policy is request-scoped.
- Every instruction emits structured progress and completion events.

### WORK-10: Platform-Neutral Target Layer

Status: not started.

Define target control, visible-surface observation, subject-state observation, app lifecycle, and connection lifecycle contracts as provider keys.

Acceptance:

- Instruction handlers do not import Appium, WebDriverIO, Android, or Docker details.
- Fakes satisfy the contracts for functional tests.
- Missing target implementations fail with clear key diagnostics.

### WORK-11: Appium/WebDriverIO Adapter

Status: not started.

Map platform-neutral contracts to configurable WebDriverIO/Appium operations.

Acceptance:

- Creation, attachment, liveness checks, actions, observation, and app lifecycle are mock-tested.
- Connection and capability errors become structured Uny diagnostics.
- WDIO custom commands can be registered once and retained by a future warm host.
- Single-target semantic instructions can be exported as namespaced browser/element commands when their dependencies, arguments, results, timeouts, cancellation, capabilities, and event emissions are explicit.
- Exported commands are re-registered after browser-wrapper or session recreation and retain no stale element handles.
- Parsing, matching, reporting, and multi-host orchestration remain outside the virtual browser.
- Tests distinguish reduced Uny/client setup from unchanged internal WebDriver/Appium round trips.

### WORK-12: Android Support

Status: not started.

Provide UiAutomator2 capabilities, Android app lifecycle, device/emulator selection, ADB integration, and target metadata. Register an explicit unsupported iOS stub so selecting iOS produces a deliberate capability error rather than a missing provider.

Acceptance:

- Capability generation and lifecycle behavior are mock-tested.
- Android satisfies the platform-neutral contracts.
- The iOS stub is registered and reports that implementation is not yet supported.
- Real-device smoke-test prerequisites are documented.

### WORK-13: Named Runtime Hosts, Sessions, and Resets

Status: not started.

Implement the persistent runtime described in [architecture.md](architecture.md#named-persistent-hosts).

Acceptance:

- `--host`, `UNY_HOST`, project `defaultHost`, and `default` follow documented precedence.
- Missing hosts auto-start and complete a ready handshake.
- Repeated short-lived clients reuse the same PID, container, matcher registry, WDIO object, custom commands, and Appium session.
- Requests use framed NDJSON with correlated incremental events.
- One host serializes requests or returns the configured busy result.
- Multiple hosts can target different devices.
- A second host cannot lease a live host's device.
- Config fingerprint changes cause a clean restart and recomposition.
- A restarted host can reattach to a valid persisted session.
- Stale process, socket, lock, lease, and session state recover predictably.
- `host start|list|status|restart|stop` keep process, session, app reset, and device reset semantics separate.
- Mobile `none`, `soft`, `hard`, and `wipe` modes match the architecture.

### Deferred: Coordinated Multi-Host Scenarios

Build this after WORK-13 provides independently addressable hosts and observation contracts are stable.

Acceptance:

- A scenario-runner client coordinates multiple named hosts without concurrent commands against one host.
- A scenario can act on one subject and wait for a normalized state predicate on another with polling/backoff and timeout policy.
- Diagnostics retain correlated command and observation timelines for every participant.
- Future push-based adapter observations and initial polling feed the same orchestration interface.
- Uny does not claim to provide the application-level communication channel between subjects.

### WORK-14: Element Discovery

Status: not started.

Implement deterministic ordered strategies for user-visible element references.

Acceptance:

- Accessibility label/text matches precede broader fallback behavior.
- Input discovery covers semantic, spatial, direct, and fallback strategies.
- Tie-breaking and spatial scoring are deterministic.
- Missing and ambiguous elements produce useful diagnostics.
- Strategies are composable and tested independently of a real device.

### WORK-15: Interaction Instructions

Status: not started.

Ship the first external mobile instruction provider with click, type, scroll, and essential navigation/action handlers.

Acceptance:

- Handlers resolve through the external registry contribution.
- Handlers depend only on platform-neutral contracts.
- Action logs identify the operation and target.
- Mocked end-to-end instruction execution passes.

### WORK-16: Assertion Instructions

Status: not started.

Add initial observation assertions such as `see "Welcome"`.

Acceptance:

- Pass and failure behavior is deterministic against fake visible surfaces.
- Failures include expected values and useful observation context.
- Human and machine sinks receive the same assertion result.

### WORK-17: Device Inspection

Status: not started.

Expose accessibility trees, screenshots, platform identity, and available device metrics independently of normal instruction execution.

Acceptance:

- Human and machine tree formats are tested.
- Screenshot output is correlated and addressable as an attachment.
- Inspection commands work through the selected named host.

### WORK-18: npm-Compatible Distribution

Status: partial.

Package the canonical binary and runtime files for installation through npm-compatible tooling.

Acceptance:

- Packed contents are verified.
- A clean install exposes `uny` on `PATH`.
- Package exports and workspace-local execution match installed behavior.
- Registry choice is recorded before publishing.

### WORK-19: Docker Runtime

Status: largely implemented; reverify after WORK-18.

Retain separate development, builder, and production runtime stages. Projects may bind mount configuration, derive an image, or invoke Uny through Compose.

Acceptance:

- A clean build produces the runtime image.
- `uny --help` and `uny inspect` work in the runtime image.
- Mounted project configuration is discoverable.
- Host socket/device connectivity requirements are documented for persistent runtime use.

### WORK-20: CI/CD

Status: partial.

Reconcile existing test, release, and image workflows with the final package registry and runtime-image design.

Acceptance:

- Tests build dependencies first and run against compiled exports.
- Package and image publishing use explicit version/tag policy.
- Required credentials and GitHub permissions are documented.
- Release workflows are reproducible from a clean checkout.

### WORK-21: AI Tooling

Status: mostly implemented.

Keep current project-owned agent configuration, config-based-modularity skill dependency, and per-client Serena stdio process. Do not recreate a shared Serena gateway or `mcp_compose.toml`.

Acceptance:

- Agent setup instructions match repository files.
- OpenCode can load project agents and Serena after restart.
- No generated dependency material is committed.

### WORK-22: Documentation and Provenance

Status: ongoing.

Keep README, contributor guidance, agent guidance, architecture, and implementation status aligned with code.

Acceptance:

- Planned and implemented behavior are clearly separated.
- Examples are smoke-tested when their implementation exists.
- Historical planning files are not maintained as competing sources of truth.

## Immediate Sequence

1. Resolve the canonical executable and finish WORK-3.
2. Reverify and close existing WORK-4 behavior through that executable.
3. Implement the option-scope model in WORK-5 without prematurely building host transport.
4. Decide Cucumber parser/messages adoption before WORK-6 and WORK-7 implementation.
5. Build structured events, parsing, matching, and the streaming executor.
6. Build platform-neutral and Appium/Android adapters.
7. Add named persistent hosts around those stable executor and adapter contracts.

## Open Decisions

| Decision | Needed before | Options or constraint |
|---|---|---|
| Canonical executable | Close WORK-3 | Package entrypoint or delegated root wrapper; never two implementations |
| Declarative config sources | Config expansion | Decide which adapters to ship first, including a possible NEON trial; every source still composes as providers/containers |
| Cucumber parser/messages | WORK-6/WORK-7 | Keep custom matcher; decide parser and report schema independently |
| Default host request policy | WORK-13 | Queue or immediate busy response |
| CLI parser library | CLI complexity requires it | Retain current parser or adopt Commander.js deliberately |
| Package registry | WORK-18/WORK-20 | Public npm; confirm scope ownership before publishing |

Decisions must be written into [architecture.md](architecture.md) when resolved, then removed from this table.

## Testing and Completion

Every implementation ticket uses test-first development. Tests should be added at the highest useful behavior boundary before lower-level units.

Completion requires:

- Relevant package tests pass through the documented build-dependent test command.
- Tests exercise compiled package exports.
- Provider composition tests cover precedence, immutable dependency transformation, and opt-in composition logs where wiring changes.
- Spawned-process tests cover CLI behavior where user-visible behavior changes.
- Mock target tests cover runner/device behavior without requiring a real device.
- Documentation and plan status are updated in the same change.
- No unrelated working-tree changes are reverted or included.

Use only the Docker Compose and package commands documented in `CONTRIBUTORS.md`; do not invent missing runner commands before they are implemented.
