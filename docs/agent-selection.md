# Agent Selection Policy

This document covers how both OpenCode and Claude Code discover and select agents, how per-agent configuration works in each harness, and the constraints that follow when agent definitions are shared across them.

Official documentation:

- OpenCode agents: <https://opencode.ai/docs/agents>
- OpenCode config schema: <https://opencode.ai/config.json>
- Claude Code subagents: <https://code.claude.com/docs/en/sub-agents>

---

## File Discovery

### OpenCode

OpenCode loads agent Markdown files from two locations, in precedence order:

1. Global: `~/.config/opencode/agents/*.md`
2. Project: `.opencode/agents/*.md`

The file stem (filename without `.md`) becomes the agent name as seen by the harness, but the `description` field in frontmatter is what OpenCode uses for user-facing labels and automatic subagent dispatch. The `model` and other fields in the file override the corresponding `agents.<name>.*` keys from `opencode.json` for that agent.

### Claude Code

Claude Code loads agent Markdown files from four locations, in priority order (highest first):

1. Managed settings (organization-wide, deployed centrally)
2. `--agents` CLI flag (current session only)
3. `.claude/agents/` (project-level)
4. `~/.claude/agents/` (user-level, all projects)

When multiple files share the same `name` field, the higher-priority location wins. The `name` field — not the filename — is the canonical identity used by Claude Code. A file without `name` is treated as documentation and silently skipped. A file without `description` is also skipped.

**Version caveat:** The discovery behavior described above applies to Claude Code v2.1.197 and later. The `/agents` interactive wizard was present on v2.1.197 and earlier; from v2.1.198 onward the wizard was replaced by the `/agents` reminder prompt.

This project's shared agent definitions live in `.agents/agents/*.md` and are copied into harness-specific directories by `agents-config` (`agents.yaml` targets `opencode-interop` → `.opencode/agents/` and `claude-interop` → `.claude/agents/`). The files themselves carry only portable fields.

---

## Default Agent

### OpenCode

The `default_agent` top-level key in `opencode.json` sets the primary agent selected when no session agent has been chosen. It is a string naming any configured agent. When absent, OpenCode defaults to the built-in **Build** agent.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "build"
}
```

This project does not set `default_agent`. Omitting it means OpenCode's built-in Build agent is the default. The test suite verifies this key is absent from `opencode.json`.

### Claude Code

Claude Code has no `default_agent` key in its settings files. The session agent is selected by:

- `--agent <name>` flag at startup (highest precedence)
- The `agent` key in the local project settings file `.claude/settings.local.json` (project-level, untracked)
- The `agent` key in the global user settings file `~/.claude/settings.json`
- Interactive agent selection during the session

User global defaults set via `~/.claude/settings.json` do not override a project-level role set in `.claude/settings.local.json`; the project-level setting takes precedence.

---

## Per-Agent Model and Config

### OpenCode: field-level merge

OpenCode merges per-agent config from multiple sources. For a named agent, the effective config is assembled in this order (later wins):

1. Built-in defaults for that agent
2. Global `~/.config/opencode/opencode.jsonc` → `agent.<name>.*`
3. Project `opencode.json` → `agent.<name>.*`

Each layer contributes individual fields. A global `agent.build.model` is overridden by a project `agent.build.model`, but a global `agent.build.permission.*` is preserved when the project does not specify it. This is **field-level merging**: the user's global config supplies defaults that the project can selectively override without replacing the whole agent definition.

Portable agent Markdown files (e.g., `.opencode/agents/build.md`) must not include a `model` field. The model must be set per-harness in `opencode.json` (or the global config) so that each user can use their own providers. Shared files with `model` would hard-code a provider that may not exist in all environments.

### Claude Code: complete definition replacement (no global merge)

Claude Code does **not** merge per-agent fields from a global config. A user-level subagent file at `~/.claude/agents/build.md` defines the complete agent; if a project-level `.claude/agents/build.md` also exists, the project-level file wins outright and the user-level definition is entirely replaced for that project.

There is no equivalent of OpenCode's global `agent.<name>.*` key layer. Users can set personal defaults by placing Markdown files in `~/.claude/agents/`, but those files are complete definitions, not incremental overrides.

Portable shared files must therefore be self-contained. They must not depend on a global config layer supplying a model or other fields, because that assumption does not hold in Claude Code. Keeping `model` out of shared definitions is required in both harnesses for different reasons: Claude Code because there is no merge layer, and OpenCode because the model must be user-supplied.

---

## The Plan Agent: Two Meanings of "plan"

Both harnesses have a concept called "plan", but they are distinct.

### OpenCode built-in Plan (uppercase conceptually, `plan` key)

OpenCode has a built-in primary agent named **Plan** (config key: `plan`). Its defaults — before any user configuration — allow file writes only to `.opencode/plans/` and the `plans/` directory under OpenCode's data directory. All other edits are refused without prompting.

**Crucially:** OpenCode applies Plan's built-in permission defaults *before* evaluating the top-level `permission` config, and the last matching rule wins. This means a project-wide `"permission": { "edit": "allow" }` overrides Plan's built-in read-only behavior. To prevent that, the project must set `agent.plan.permission.edit: "deny"` explicitly in `opencode.json`, which fires after the project-wide rule and re-denies edits for Plan.

This project's `opencode.json` includes exactly this:

```json
{
  "permission": { "edit": "allow" },
  "agent": {
    "plan": {
      "permission": { "edit": "deny" }
    }
  }
}
```

### Claude Code `permissionMode: plan`

Claude Code recognizes a frontmatter field `permissionMode: plan` in agent files. This is a permission mode enforced by the Claude Code harness itself: it puts the agent into a read-only state where file modifications are denied at the harness level. It is not an agent name; it is a capability flag for any agent definition.

OpenCode does not recognize `permissionMode` and ignores unknown frontmatter fields, so the field is safe to include in a shared portable file without breaking OpenCode.

This project's `plan.md` carries `permissionMode: plan` so that Claude Code enforces read-only behavior for that agent. The `opencode.json` `agent.plan.permission.edit: deny` entry is still required for OpenCode, where `permissionMode` is ignored.

### Same-name project role vs. built-in Plan

A project agent file named `plan.md` with `name: plan` creates a custom agent that **overrides** the built-in Plan agent in both harnesses when the file is in scope. The file body becomes the system prompt, and the project's frontmatter fields (such as `permissionMode: plan` for Claude Code) apply instead of the built-in defaults.

This project deliberately defines a `plan` agent with its own description and system prompt. The shared file carries `permissionMode: plan` so Claude Code enforces read-only access. OpenCode uses `agent.plan.permission.edit: deny` in `opencode.json` for the same effect.

---

## What This Project Does Not Set

These keys are intentionally absent from `opencode.json` and the shared agent files to preserve portability and correct harness behavior:

| What is absent | Why |
|---|---|
| `default_agent` in `opencode.json` | No project-specific default needed; omitting it leaves OpenCode's built-in Build as the default |
| `model` in any `agent.*` block in `opencode.json` | Model selection is personal; each user supplies model config in their global `~/.config/opencode/opencode.jsonc` |
| `model` in any `.agents/agents/*.md` file | Model fields are not portable across providers; omitting them requires users to supply model config in their harness-specific config |
| `default` key under `agent.*` in `opencode.json` | Not a valid OpenCode config field; the correct key is `default_agent` at the top level |

---

## Native CLI Discovery

The following commands are available without LLM requests or config writes. They report what agents are known to the harness.

### OpenCode

OpenCode does not expose a standalone CLI listing of loaded agents at this time. Agent resolution occurs at session startup. Inspect `.opencode/agents/` for project agents and `~/.config/opencode/agents/` for global agents.

### Claude Code (v2.1.197+)

```sh
# List active sessions (does not enumerate loaded agents; requires a running session)
claude agents --json
```

To verify which agent files Claude Code loaded, run Claude Code with `--debug` and inspect the debug log:

```sh
claude --debug --print "list agents" 2>/dev/null
# Debug log: ~/.claude/debug/<session-id>.txt
```

The debug log records which agent files were loaded and lists up to five unrecognized frontmatter fields per file. This is the only native mechanism for verifying file discovery without starting a full session.

**Version caveat:** `--debug` logging and the field-recognition reporting require Claude Code v2.1.296 or later for the five-field summary.

These probes confirm file loading and frontmatter parsing. They do not verify harness-level merging behavior (such as OpenCode's field-level global merge), which can only be confirmed by starting a session and observing the effective agent config.
