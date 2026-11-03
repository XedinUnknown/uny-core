/**
 * Tests for agent definition files and configuration wiring.
 *
 * Verifies that .agents/agents/*.md use the shared native-compatible format
 * (flat description/color frontmatter, no agentloom opencode nesting, no
 * model selection), that agents.yaml declares the interop targets needed for
 * harness discovery, and that opencode.json wires the plan agent's read-only
 * permission to override the project-wide edit:allow grant.
 *
 * Run: node --test tests/agents.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse: parseYaml } = require("yaml");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/**
 * Parse the YAML frontmatter from a Markdown file.
 * Returns { frontmatter, body } where frontmatter is the parsed object and
 * body is the text after the closing ---.
 */
function parseAgentMd(filePath) {
  const content = readFileSync(filePath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(match, `${filePath}: missing or malformed frontmatter`);
  return {
    frontmatter: parseYaml(match[1]),
    body: match[2].trim(),
  };
}

const AGENT_NAMES = ["plan", "build", "code"];

describe("agent definition files (.agents/agents/*.md)", () => {
  for (const name of AGENT_NAMES) {
    const filePath = join(root, ".agents", "agents", `${name}.md`);

    describe(`${name}.md`, () => {
      it("has a non-empty description in frontmatter", () => {
        const { frontmatter } = parseAgentMd(filePath);
        assert.ok(
          typeof frontmatter.description === "string" &&
            frontmatter.description.trim().length > 0,
          "description must be a non-empty string"
        );
      });

      it("does not carry an agentloom name field (name is derived from filename)", () => {
        const { frontmatter } = parseAgentMd(filePath);
        assert.ok(
          !("name" in frontmatter),
          "name field must be absent; the agent name is the filename without .md"
        );
      });

      it("does not carry a nested opencode block", () => {
        const { frontmatter } = parseAgentMd(filePath);
        assert.ok(
          !("opencode" in frontmatter),
          "opencode nested block must be absent; use flat frontmatter fields"
        );
      });

      it("does not select a model (model selection is not portable)", () => {
        const { frontmatter } = parseAgentMd(filePath);
        assert.ok(
          !("model" in frontmatter),
          "model must not be set in shared agent definitions"
        );
      });

      it("has a non-empty system prompt body", () => {
        const { body } = parseAgentMd(filePath);
        assert.ok(body.length > 0, "agent body must contain a system prompt");
      });
    });
  }
});

describe("agents.yaml target configuration", () => {
  const agentsYaml = parseYaml(
    readFileSync(join(root, "agents.yaml"), "utf8")
  );

  it("declares interop target", () => {
    assert.ok(
      agentsYaml.targets?.interop === true,
      "interop target must be enabled"
    );
  });

  it("declares claude-interop target for Claude Code harness discovery", () => {
    assert.ok(
      agentsYaml.targets?.["claude-interop"] === true,
      "claude-interop target must be enabled so agents are discoverable by Claude Code"
    );
  });

  it("declares opencode-interop target for OpenCode harness discovery", () => {
    assert.ok(
      agentsYaml.targets?.["opencode-interop"] === true,
      "opencode-interop target must be enabled so agents are copied to .opencode/agents"
    );
  });
});

describe("opencode.json plan agent permission wiring", () => {
  const opencodeCfg = JSON.parse(
    readFileSync(join(root, "opencode.json"), "utf8")
  );

  it("denies edit for plan agent to enforce read-only mode", () => {
    assert.strictEqual(
      opencodeCfg.agent?.plan?.permission?.edit,
      "deny",
      "plan agent must override the project-wide edit:allow with edit:deny"
    );
  });

  it("does not select a model for plan agent (no model selection)", () => {
    assert.ok(
      !("model" in (opencodeCfg.agent?.plan ?? {})),
      "plan agent must not set a model in opencode.json"
    );
  });

  it("does not change the default primary agent selection", () => {
    assert.ok(
      !("default" in (opencodeCfg.agent ?? {})),
      "no default agent must be declared in opencode.json"
    );
  });
});
