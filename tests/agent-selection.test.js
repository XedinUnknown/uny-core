// Agent selection policy invariants — docs/agent-selection.md.
// Covers selection-specific checks not in agents.test.js.
// Static file checks only; runtime harness merge behavior is not verified.
// Run: node --test tests/agent-selection.test.js
// To include the CLI probe: OPENCODE_BIN=~/.opencode/bin/opencode node --test tests/agent-selection.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(root, "opencode.json"), "utf8"));

function fm(name) {
  const txt = readFileSync(join(root, ".agents/agents", `${name}.md`), "utf8");
  const m = txt.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(m, `${name}.md: missing frontmatter`);
  return m[1];
}
function has(raw, key) { return new RegExp(`^${key}:`, "m").test(raw); }

describe("agent selection policy", () => {
  it("opencode.json: no invalid 'default' key inside agent.*; no model in any agent block", () => {
    const agent = cfg.agent ?? {};
    assert.ok(!("default" in agent), "'default' inside agent.* is invalid; use top-level default_agent");
    for (const [name, def] of Object.entries(agent))
      assert.ok(!("model" in (def ?? {})), `agent.${name} must not set model — personal, not project-owned`);
  });

  it("permissionMode: plan appears only in plan.md, not in build.md or code.md", () => {
    for (const name of ["build", "code"])
      assert.ok(!has(fm(name), "permissionMode"), `${name}.md must not carry permissionMode`);
  });

  it("opencode agent list exits 0 when OPENCODE_BIN is set", { skip: !process.env.OPENCODE_BIN }, () => {
    execFileSync(process.env.OPENCODE_BIN, ["agent", "list"], { stdio: "pipe" });
  });
});
