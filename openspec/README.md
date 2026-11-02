# OpenSpec Baseline

The initial specs describe implementation committed at
[`5c0e1b5`](https://github.com/XedinUnknown/uny-core/tree/5c0e1b5).
They record what exists, including limitations, rather than approve the current
design or promise planned functionality.

This setup was ported from the former `UN1Q-com/uny` OpenSpec exercise.
The destination's `packages/` and `bin/` contents match the original baseline
implementation. The named `provider` export alternative was deliberately
excluded from requirements; its implementation remains unchanged.

## Process

This baseline follows the community's [code-first workaround](https://github.com/Fission-AI/OpenSpec/issues/724)
and [maintainer guidance](https://github.com/Fission-AI/OpenSpec/issues/214#issuecomment-3420670314):
read the implementation, generate capability specs, and review them against code.
OpenSpec has no built-in reverse-generation command. Its normal
[existing-project adoption workflow](https://github.com/Fission-AI/OpenSpec/blob/main/docs/existing-projects.md)
grows specs through changes instead; this is an explicitly requested baseline.

1. Use a separate checkout of the recorded commit as implementation evidence.
2. Inspect committed source, tests, fixtures, and package exports by capability.
3. Describe current behavior as requirements and scenarios, with evidence links.
4. Independently review claims against source and tests, preserving current quirks
   rather than fixing them or importing intended behavior.
5. Run strict OpenSpec validation and the existing package tests. Human PR review
   remains necessary before accepting reverse-generated specs as ground truth.

## Scope

- [DI composition](specs/di-composition/spec.md): providers, helpers, and provenance.
- [DI containers](specs/di-containers/spec.md): resolution, decorators, bootstrap,
  caching, and errors.
- [Core configuration](specs/core-config/spec.md): implemented app keys and paths.
- [CLI](specs/cli/spec.md): flags, config loading, inspection, and the distinct
  root executable skeleton.

Plans, memories, TODOs, and the intended DI contract are not requirement sources.
No instruction runner, persistent host, session lifecycle, or device adapter is
specified. Source-derived edge cases are not presented as existing test coverage.
Build and delivery tooling are outside the application capability baseline.

The baseline is written directly into `specs/`; there is no fictitious feature
proposal, implementation task list, or archived application change.
