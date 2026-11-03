/**
 * Tests for agent selection policy invariants.
 *
 * Verifies config invariants that follow from docs/agent-selection.md:
 *
 * opencode.json:
 * - no default_agent key (no project-specific default; omitting it leaves
 *   OpenCode's built-in Build as the default)
 * - no model in any agent.* block (model selection is personal; each user
 *   supplies model config in their global opencode.jsonc)
 * - plan agent carries permission.edit: deny (required because OpenCode's
 *   built-in Plan defaults apply before the project-wide edit:allow, and the
 *   last matching rule wins — without this explicit deny, the project-wide
 *   allow overrides Plan's read-only intent)
 *
 * .agents/agents/plan.md:
 * - carries permissionMode: plan (Claude Code reads this field and enforces
 *   read-only mode at the harness level; OpenCode ignores unknown frontmatter
 *   fields, so the field is safe in the shared file)
 * - no model field (portable; model not supplied by shared definitions)
 *
 * .agents/agents/build.md, code.md:
 * - no model field (portable)
 *
 * The tests do not start a session or make LLM requests. They verify file
 * content invariants. They cannot verify runtime harness behavior such as
 * OpenCode's field-level global merge or Claude Code's complete definition
 * replacement; those require a running session.
 *
 * Run with: node --test tests/agent-selection.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function readJson(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), "utf8"));
}

/**
 * Extract raw YAML frontmatter and body from a Markdown file.
 * Returns { raw, body } where raw is text between --- delimiters.
 */
function extractFrontmatter(filePath) {
  const content = readFileSync(filePath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  assert.ok(match, `${filePath}: missing or malformed frontmatter`);
  return { raw: match[1], body: match[2].trim() };
}

function getFrontmatterValue(raw, key) {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const m = raw.match(re);
  return m ? m[1].trim() : undefined;
}

function hasFrontmatterKey(raw, key) {
  return new RegExp(`^${key}:`, "m").test(raw);
}

// --- opencode.json invariants ---

describe("opencode.json agent selection invariants", () => {
  const cfg = readJson("opencode.json");

  it("does not set default_agent (no project-specific primary agent default)", () => {
    assert.ok(
      !("default_agent" in cfg),
      "default_agent must be absent; omitting it leaves OpenCode's built-in Build as the default"
    );
  });

  it("does not use the invalid 'default' key inside agent.* (correct key is top-level default_agent)", () => {
    const agentCfg = cfg.agent ?? {};
    assert.ok(
      !("default" in agentCfg),
      "'default' inside agent.* is not a valid OpenCode field; use top-level default_agent"
    );
  });

  it("plan agent sets permission.edit: deny to enforce read-only over project-wide edit:allow", () => {
    assert.strictEqual(
      cfg.agent?.plan?.permission?.edit,
      "deny",
      "plan agent must set permission.edit:deny — OpenCode applies Plan defaults before the project-wide edit:allow, and the last rule wins"
    );
  });

  it("no agent block sets a model (model selection is personal, not project-owned)", () => {
    const agentCfg = cfg.agent ?? {};
    for (const [name, def] of Object.entries(agentCfg)) {
      assert.ok(
        !("model" in (def ?? {})),
        `agent.${name} must not set model in opencode.json — model selection is personal`
      );
    }
  });
});

// --- shared agent file invariants ---

describe("shared agent files: no model field (portable definitions)", () => {
  for (const agentName of ["plan", "build", "code"]) {
    const filePath = join(root, ".agents", "agents", `${agentName}.md`);

    it(`${agentName}.md: no model field`, () => {
      const { raw } = extractFrontmatter(filePath);
      assert.ok(
        !hasFrontmatterKey(raw, "model"),
        `${agentName}.md must not set model — model is not portable across providers`
      );
    });
  }
});

describe("plan.md: permissionMode: plan for Claude Code read-only enforcement", () => {
  const filePath = join(root, ".agents", "agents", "plan.md");

  it("carries permissionMode: plan (Claude Code enforces read-only; OpenCode ignores unknown fields)", () => {
    const { raw } = extractFrontmatter(filePath);
    assert.strictEqual(
      getFrontmatterValue(raw, "permissionMode"),
      "plan",
      "plan.md must carry permissionMode: plan — Claude Code enforces harness-level read-only; OpenCode ignores it safely"
    );
  });

  it("permissionMode: plan is a Claude Code capability flag, not an agent name (documented in plan.md)", () => {
    // This is a documentation invariant: the field must appear only in plan.md,
    // not in build.md or code.md where it would be inappropriate.
    for (const agentName of ["build", "code"]) {
      const fp = join(root, ".agents", "agents", `${agentName}.md`);
      const { raw } = extractFrontmatter(fp);
      assert.ok(
        !hasFrontmatterKey(raw, "permissionMode"),
        `${agentName}.md must not carry permissionMode; the field is specific to plan read-only enforcement`
      );
    }
  });
});
