# Observability: Sinks, Verbosity, NDJSON

## Sink model — the load-bearing rule

One logger. One **structured event object**. Multiple sinks rendering it independently.
Nothing converts one output format into another.

```
event { action, outcome, text, duration, ... }
  ├─ human sink    → stdout/stderr, TTY-aware, emoji, in-place updates
  ├─ ndjson sink   → file | socket | HTTP
  └─ report sink   → e.g. cucumber-messages (planned)
```

**Never format at the call site.** Emitting `notice("✅ click \"Login\"")` is wrong: status is
baked into prose, so it is ungreppable and every sink inherits one sink's presentation.
Emit fields; let the human sink add the ✅ and the NDJSON sink write `outcome`.

This is the general external-extension pattern (`mem:architecture/composition`) applied to
logging specifically: implementations hold no logger reference at all; a provider wraps them.

Sinks run concurrently and independently. A general NDJSON log and a report stream can both be
active in one run. Constraint: never interleave protocol envelopes into the general log stream —
consumers of each expect a homogeneous stream.

Adding a sink is adding a provider. Network streaming to an observability platform is the same
NDJSON sink pointed at a socket.

## Field profile: Pino is the standard

There is no single universal NDJSON logging field standard to defer to. Pino/Bunyan are
Node-ecosystem de facto formats; ECS (Elastic Common Schema) is one vendor's ingestion
convention, not a cross-vendor spec; OpenTelemetry is the emerging cross-vendor standard but
uses a fundamentally different envelope (OTLP, protobuf/JSON batches with Resource/Scope
wrappers), not flat one-object-per-line NDJSON. None of the generic query tools this format
targets (`jq`, Miller, DuckDB, ClickHouse, pandas, angle-grinder) care about field *names* at
all — they parse whatever keys exist. The only consumers that benefit from a specific field
*name* are pino-pretty and lnav's format auto-detection, and both already key off Pino's shape.

Given that, **Pino's field shape is the canonical format**, not one of two:

```json
{
  "level": 30,
  "time": 1787142896789,
  "msg": "click \"Login\"",
  "action": "step.finished",
  "outcome": "success",
  "sequence": 42,
  "runId": "..."
}
```

- `level` (numeric) + `time` (epoch ms) + `msg` (string) are Pino's base fields. Ladder:
  trace 10, debug 20, info 30, warn 40, error 50, fatal 60. This keeps **pino-pretty** working
  unmodified as an external human formatter, and lnav's Pino format definition working unmodified
  as a log viewer.
- `action`, `outcome`, `sequence`, `runId` are this project's own additional fields — new
  information, not synonyms of anything Pino already has, so no duplication cost. Flat,
  non-dotted names: no ECS-style namespacing is implied or claimed.
- If a specific ingestion target later needs ECS or OTel shape, that translation is a shipper-side
  remap (Vector, Fluent Bit, and Grafana Alloy all support this natively) — not baked into every
  emitted line permanently. Do not add a second parallel field set "just in case."

**Anti-pattern, do not repeat:** using seconds-since-start as the `time` value. Pino's `time` is
epoch milliseconds; no tool reads relative seconds as a timestamp. Keep relative elapsed seconds
as a separate, clearly named extra field for humans if wanted — never as `time` itself.

Verified consumers of plain NDJSON, none of which require a specific field-name schema:
`jq`, Miller (`--ijsonl`), DuckDB (`read_ndjson`), ClickHouse (`NDJSON`), pandas (`lines=True`),
angle-grinder (zero-config); `lnav` (log viewing, ships a Pino format definition); Vector, Fluent
Bit, Grafana Alloy (shippers, with a parse step). **Not** drop-in: Elasticsearch/OpenSearch Bulk
requires an action/metadata line before each document — needs a shipper or a dedicated export
mode, regardless of field-name choice.

Format is plain UTF-8 NDJSON, one compact JSON object per LF, `.ndjson`/`.jsonl`. No blank or
non-JSON lines on that stream. Not RFC 7464 json-seq (no `0x1E` record separators).

## Verbosity

Single integer scale, default 0. `-v` increments, `-q` decrements. This is a CLI-facing
routing/visibility concept, orthogonal to the `level` field emitted to NDJSON — the default
visible tier ("notice") maps to Pino's `info` (30) for wire purposes; there is no separate
wire-level severity name for it.

| Level | Emitted |
|---|---|
| -3 | nothing (exit code only) |
| -2 | errors |
| -1 | + warnings |
| 0 | + notices |
| 1 | + infrastructure info |
| 2 | + debug |
| 3 | + raw trace |

Routing invariant: the default-visibility tier ("notice") → **stdout** (machine-parseable
results). Everything else → **stderr** (diagnostics). Never emit diagnostics on stdout.

Human sink: TTY → in-place carriage-return updates, frozen `[MM:SS]`, emoji hierarchy.
Non-TTY → plain newline-separated lines with real timestamps.

## Open: Cucumber Messages report mode

Under active exploration, not decided.

Cucumber Messages **is** an NDJSON protocol — one `Envelope` per line. The official HTML
formatter consumes it from *any* implementation, not only Cucumber's. So a
`--format cucumber-messages` sink buys HTML reports and Cucumber Reports integration, and makes
the surface familiar to Cucumber users.

Cost is the linked object graph, not the line format:

```
source → gherkinDocument → pickle → testCase → testCaseStarted → testStepStarted/Finished
         (AST, locations)   (compiled,  (steps → pickleStepId,
                             outlines    stepDefinitionIds)
                             expanded)
```

Runtime results must resolve back through `testCase` → `pickle` → `gherkinDocument` to render.
Emitting only `testStepFinished` produces an empty report.

Effort splits by mode: stdin/ad-hoc is cheap (synthesise one feature / one scenario / N steps).
Full feature-file fidelity — backgrounds, outlines, examples, tags, docstrings, data tables,
pickle compilation semantics — is effectively rebuilding `@cucumber/gherkin`.

**Unresolved decision.** The founding plan rejects Cucumber wholesale, but argued the rejection
only against its *matcher* ("too limited" for expressions). Three separable components:

| Component | Plan stance | Warranted |
|---|---|---|
| expression matching | reject, build custom | yes — the differentiator |
| Gherkin AST + pickle compilation | reject | questionable — mechanical work |
| message schema / envelopes | not considered | adopting costs nothing |

`@cucumber/gherkin` emits `gherkinDocument` and `pickle` envelopes natively. Adopting it for
parsing while keeping the custom matcher for resolution would make this output nearly free and
preserve the part that actually matters. Decide before building the parser.
