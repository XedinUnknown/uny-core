# Agents

Hand-written canonical agent definitions live in `agents/`. Each file is a
portable Markdown document with a YAML frontmatter block containing `name`,
`description`, and any harness-neutral fields such as `permissionMode`. No
model, color, or tool-specific keys belong here.

[agents-config](https://github.com/XedinUnknown/agents-config) links or copies
these definitions to each harness through its declared targets (`interop`,
`claude-interop`, `opencode-interop`). Run `pnpm exec agents-config install`
(or `agents-config install` if the CLI is on `PATH`) from the project root, or
inside the dev container, to apply the current `agents.yaml` and `agents-lock.json`.
