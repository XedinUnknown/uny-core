// Agent definition and config wiring tests.
// Run: node --test tests/agents.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fm(name) {
  const txt = readFileSync(join(root, ".agents/agents", `${name}.md`), "utf8");
  const m = txt.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(m, `${name}.md: missing frontmatter`);
  return m[1];
}

function val(raw, key) {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : undefined;
}

function has(raw, key) { return new RegExp(`^${key}:`, "m").test(raw); }

describe("agent files", () => {
  for (const name of ["plan", "build", "code"]) {
    it(`${name}.md: name, description, no model, no color, no opencode block`, () => {
      const raw = fm(name);
      assert.strictEqual(val(raw, "name"), name, "name must match filename");
      assert.ok(val(raw, "description"), "description required");
      assert.ok(!has(raw, "model"), "no model in shared files");
      assert.ok(!has(raw, "color"), "no color in shared files");
      assert.ok(!has(raw, "opencode"), "no opencode block");
    });
  }

  it("plan.md: permissionMode is plan", () => {
    assert.strictEqual(val(fm("plan"), "permissionMode"), "plan");
  });
});

describe("agents.yaml", () => {
  const raw = readFileSync(join(root, "agents.yaml"), "utf8");
  for (const target of ["interop", "claude-interop", "opencode-interop"]) {
    it(`declares ${target}`, () => {
      assert.match(raw, new RegExp(`^\\s*${target}:\\s*true\\s*$`, "m"));
    });
  }
});

describe("opencode.json", () => {
  const cfg = JSON.parse(readFileSync(join(root, "opencode.json"), "utf8"));
  it("plan agent denies edit, no model, no default_agent key", () => {
    assert.strictEqual(cfg.agent?.plan?.permission?.edit, "deny");
    assert.ok(!("model" in (cfg.agent?.plan ?? {})));
    assert.ok(!("default_agent" in cfg));
  });
});
