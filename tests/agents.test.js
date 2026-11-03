/**
 * Tests for agent definition files and configuration wiring.
 *
 * Verifies that .agents/agents/*.md use the shared native-compatible format:
 * - name present (Claude Code requires it; files without name are silently
 *   skipped as documentation per official Claude Code docs)
 * - name matches the filename stem (the canonical identity for the agent)
 * - description present (required by both Claude Code and OpenCode)
 * - no model field (not portable across harnesses or users)
 * - no color field (Claude Code accepts only a fixed set of named colors, not
 *   hex; OpenCode accepts hex; the sets are incompatible, so color is
 *   omitted from shared files and set per-harness in opencode.json instead)
 * - no nested opencode block (agentloom artifact)
 * - plan.md carries permissionMode: plan (recognized by Claude Code as
 *   read-only enforcement; OpenCode ignores unknown frontmatter fields, so
 *   this is safe in the shared file)
 * - non-empty system prompt body
 *
 * Verifies agents.yaml declares interop, claude-interop, and opencode-interop.
 *
 * Verifies opencode.json:
 * - agent.plan.permission.edit is "deny" (OpenCode-specific override needed
 *   because the project-wide permission.edit:allow would otherwise take
 *   precedence over OpenCode's built-in plan defaults)
 * - agent.plan has no model (no model selection)
 * - no default agent key (no default agent changed)
 *
 * Parsing: plain regex extraction of frontmatter key: value lines.
 * No external dependencies — runs with: node --test tests/agents.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/**
 * Extract the raw YAML frontmatter block and body from a Markdown file.
 * Returns { raw, body } where raw is the text between the opening and closing
 * --- delimiters and body is the text after the closing ---.
 * Asserts that the file has a well-formed frontmatter block.
 */
function extractFrontmatter(filePath) {
  const content = readFileSync(filePath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  assert.ok(match, `${filePath}: missing or malformed frontmatter (--- block must start at line 1)`);
  return { raw: match[1], body: match[2].trim() };
}

/**
 * Read a scalar value for a top-level key from raw YAML frontmatter.
 * Returns the trimmed value string, or undefined when the key is absent.
 * Only matches lines of the form "key: value" at column 0 (no nesting).
 */
function getFrontmatterValue(raw, key) {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const m = raw.match(re);
  return m ? m[1].trim() : undefined;
}

/**
 * Return true when the raw frontmatter contains a top-level "key:" entry
 * (with or without a value on the same line).
 */
function hasFrontmatterKey(raw, key) {
  return new RegExp(`^${key}:`, "m").test(raw);
}

const AGENT_NAMES = ["plan", "build", "code"];

describe("agent definition files (.agents/agents/*.md)", () => {
  for (const agentName of AGENT_NAMES) {
    const filePath = join(root, ".agents", "agents", `${agentName}.md`);

    describe(`${agentName}.md`, () => {
      it("has a name field (required by Claude Code; files without name are silently skipped)", () => {
        const { raw } = extractFrontmatter(filePath);
        assert.ok(
          hasFrontmatterKey(raw, "name"),
          "name field must be present — Claude Code skips files without it"
        );
      });

      it("name matches the filename stem", () => {
        const { raw } = extractFrontmatter(filePath);
        const value = getFrontmatterValue(raw, "name");
        assert.strictEqual(
          value,
          agentName,
          `name must equal the filename stem "${agentName}"`
        );
      });

      it("has a non-empty description", () => {
        const { raw } = extractFrontmatter(filePath);
        const value = getFrontmatterValue(raw, "description");
        assert.ok(
          typeof value === "string" && value.trim().length > 0,
          "description must be a non-empty string"
        );
      });

      it("does not carry a model field (model selection is not portable)", () => {
        const { raw } = extractFrontmatter(filePath);
        assert.ok(
          !hasFrontmatterKey(raw, "model"),
          "model must be absent from shared agent definitions"
        );
      });

      it("does not carry a color field (hex unsupported by Claude Code; named sets differ between harnesses)", () => {
        const { raw } = extractFrontmatter(filePath);
        assert.ok(
          !hasFrontmatterKey(raw, "color"),
          "color must be absent from shared files; set per-harness in opencode.json instead"
        );
      });

      it("does not carry a nested opencode block (agentloom artifact)", () => {
        const { raw } = extractFrontmatter(filePath);
        assert.ok(
          !hasFrontmatterKey(raw, "opencode"),
          "opencode nested block must be absent; use flat frontmatter fields"
        );
      });

      it("has a non-empty system prompt body", () => {
        const { body } = extractFrontmatter(filePath);
        assert.ok(body.length > 0, "agent body must contain a system prompt");
      });
    });
  }

  describe("plan.md specific", () => {
    const filePath = join(root, ".agents", "agents", "plan.md");

    it("carries permissionMode: plan for read-only enforcement in Claude Code", () => {
      const { raw } = extractFrontmatter(filePath);
      const value = getFrontmatterValue(raw, "permissionMode");
      assert.strictEqual(
        value,
        "plan",
        "plan.md must set permissionMode: plan — Claude Code enforces read-only; OpenCode ignores unknown fields"
      );
    });
  });
});

describe("agents.yaml target configuration", () => {
  const raw = readFileSync(join(root, "agents.yaml"), "utf8");

  it("declares interop target", () => {
    assert.match(raw, /^\s*interop:\s*true\s*$/m, "interop target must be enabled");
  });

  it("declares claude-interop target for Claude Code harness discovery", () => {
    assert.match(
      raw,
      /^\s*claude-interop:\s*true\s*$/m,
      "claude-interop target must be enabled so agents are discoverable by Claude Code"
    );
  });

  it("declares opencode-interop target for OpenCode harness discovery", () => {
    assert.match(
      raw,
      /^\s*opencode-interop:\s*true\s*$/m,
      "opencode-interop target must be enabled so agents are copied to .opencode/agents"
    );
  });
});

describe("opencode.json plan agent permission wiring", () => {
  const cfg = JSON.parse(readFileSync(join(root, "opencode.json"), "utf8"));

  it("denies edit for plan agent to override project-wide edit:allow", () => {
    assert.strictEqual(
      cfg.agent?.plan?.permission?.edit,
      "deny",
      "plan agent must set permission.edit:deny to override the project-wide edit:allow"
    );
  });

  it("does not select a model for plan agent", () => {
    assert.ok(
      !("model" in (cfg.agent?.plan ?? {})),
      "plan agent must not set a model in opencode.json"
    );
  });

  it("does not declare a default agent", () => {
    assert.ok(
      !("default" in (cfg.agent ?? {})),
      "no default agent must be declared in opencode.json"
    );
  });
});
