# Task Completion

Run before considering a coding task done:

```bash
pnpm build     # or pnpm build:changed for a scoped change
pnpm test
```

Nx builds before tests automatically; a separate build is only worth running to isolate a
compile failure from a test failure.

## Checklist

- Feature-facing test written **first** and now passing — see `mem:conventions`.
- Tests exercise compiled `dist/`, not `src/`.
- New public API is reachable through the package `exports` field, otherwise consumers cannot
  import it.
- No logger calls added inside implementations; cross-cutting behaviour goes in extensions.
- No output formatted at a call site.
- New container keys are namespaced and documented in `mem:architecture/keys` if they establish
  new vocabulary.
- Docs touched only if behaviour changed. `README.md` and `CONTRIBUTORS.md` are human-facing;
  agent-durable facts belong in memories.

## No lint/format step

This repo has no lint or format command. Do not invent or add one as part of "completion".

## After memory or config changes

- `serena memories check` after renaming/deleting memories.
- `serena project index` after large structural changes.
- Restart OpenCode after editing `opencode.json`, `.agents/`, or `.opencode/`.

## Never without explicit request

Commit, amend, push, or create PRs.
