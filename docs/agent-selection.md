# Agent Selection Policy

Sources: [OpenCode agents](https://opencode.ai/docs/agents) · [OpenCode config](https://opencode.ai/docs/config) · [Claude Code sub-agents](https://code.claude.com/docs/en/sub-agents)

## File Discovery

**OpenCode** loads agent Markdown files from (lower index = higher priority):

1. `.opencode/agents/` — project-level
2. `~/.config/opencode/agents/` — global

The filename stem becomes the agent name in OpenCode.

**Claude Code** loads agent files from (lower index = higher priority):

1. Managed settings — organization-wide
2. `--agents` CLI flag — current session
3. `.claude/agents/` — project-level
4. `~/.claude/agents/` — global

The `name` frontmatter field — not the filename — is the canonical identity. Files without `name` or `description` are silently skipped.

This project's shared definitions live in `.agents/agents/` and are copied into harness directories by `agents-config` (`opencode-interop` → `.opencode/agents/`, `claude-interop` → `.claude/agents/`).

## Default Agent

**OpenCode:** the `default_agent` top-level key in `opencode.json` selects the primary agent when no session agent is chosen. Config files are merged across sources (global then project); the project value overrides the global value for this key. If `default_agent` is absent from all config sources, OpenCode falls back to `build` with a warning when the specified agent is missing or a subagent. This project does not set `default_agent`; the effective default is inherited from the global config if set there, otherwise OpenCode uses `build`.

**Claude Code:** no equivalent config key. The session agent is set via `--agent <name>` or interactively. User global defaults in `~/.claude/settings.json` do not override a project-level setting in `.claude/settings.local.json`.

## Per-Agent Model Policy

**OpenCode:** configs are merged field-by-field across sources. A global `~/.config/opencode/opencode.json` entry for `agent.build.model` supplies a default that the project `opencode.json` can override per field — without replacing the whole agent definition. This project's `opencode.json` omits `model` from all `agent.*` blocks; users supply their model in their global config.

**Claude Code:** no per-agent global merge layer exists. A project-level `.claude/agents/build.md` replaces the user-level `~/.claude/agents/build.md` entirely for that project. Shared portable files must be self-contained and must not assume a global config layer will supply a model.

## The `plan` Name: Two Separate Things

**OpenCode built-in Plan** (`agent` key `plan`) is a built-in primary agent. Its default permissions allow writes only inside `.opencode/plans/`. These defaults apply before the project-wide `permission` config, and the last matching rule wins, so a project-wide `"edit": "allow"` overrides them. This project sets `agent.plan.permission.edit: "deny"` in `opencode.json` to restore read-only behavior for OpenCode.

**Claude Code `permissionMode: plan`** is a frontmatter field recognized by Claude Code that puts any agent into a harness-enforced read-only mode. It is a capability flag, not an agent name. OpenCode does not recognize this field and ignores it safely.

A project agent file with `name: plan` defines a separate agent that coexists with each harness's own built-in Plan concept. The two are distinct: the shared `plan.md` file here is a named agent definition; `permissionMode: plan` is a Claude Code read-only flag carried inside it for that harness.

## What This Project Omits

| Absent | Reason |
|---|---|
| `default_agent` in `opencode.json` | No project default needed; inherits from global config or OpenCode's fallback |
| `model` in any `agent.*` block | Personal; supplied by the user's global config |
| `model` in any `.agents/agents/*.md` | Not portable across providers |

## Native CLI Probe

**OpenCode** (requires binary; check `~/.opencode/bin/opencode` if not on `PATH`):

```sh
opencode agent list   # lists loaded agents and their effective permissions
```

**Claude Code:**

```sh
claude agents --json  # lists active background sessions; does not enumerate loaded agent files
```

To confirm which Claude Code agent files were loaded, inspect `.claude/agents/` and `~/.claude/agents/` directly.
