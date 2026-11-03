/**
 * Tests for bin/sync-mcp.mjs — MCP projection generator.
 *
 * Run: node --test tests/mcp.test.mjs
 *
 * All tests use in-process fixture roots (no real fs writes to project files,
 * no spawned processes). The sync-mcp module is imported with a custom root
 * path so every test remains fully isolated.
 */

import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Helper: import the module under test with a given root so tests are isolated
// ---------------------------------------------------------------------------

/** Absolute path to the script under test. */
const SCRIPT = resolve(
  new URL("../bin/sync-mcp.mjs", import.meta.url).pathname
);

/**
 * Import the module's exported API.
 * Each call should get a fresh module; we side-step ESM caching by appending a
 * query param (Node ignores query params for actual resolution but busts cache).
 */
let _importSeq = 0;
async function importSync(root) {
  const mod = await import(`${SCRIPT}?_=${++_importSeq}`);
  return mod;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Canonical server entries matching mcp.servers.json */
const CANONICAL_SERENA = {
  type: "stdio",
  command: "${HOME}/.local/bin/uvx",
  args: [
    "-p",
    "3.13",
    "--from",
    "git+https://github.com/oraios/serena",
    "serena",
    "start-mcp-server",
    "--context=ide",
    "--open-web-dashboard=false",
    "--project-from-cwd",
  ],
  env: { BROWSER: "/bin/true" },
};

const CANONICAL_JETBRAINS = {
  type: "sse",
  url: "http://127.0.0.1:64342/sse",
};

const CANONICAL_SERVERS = {
  serena: CANONICAL_SERENA,
  jetbrains: CANONICAL_JETBRAINS,
};

function makeCanonical(servers = CANONICAL_SERVERS) {
  return { servers };
}

async function writeCanonical(root, content = makeCanonical()) {
  await writeFile(join(root, "mcp.servers.json"), JSON.stringify(content, null, 2));
}

async function writeOpenCode(root, content) {
  await writeFile(join(root, "opencode.json"), JSON.stringify(content, null, 2));
}

async function writeClaudeMcp(root, content) {
  await writeFile(join(root, ".mcp.json"), JSON.stringify(content, null, 2));
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), "mcp-test-"));
  return root;
}

// ---------------------------------------------------------------------------
// Import the module once to access exported helpers
// The module MUST export: generate(), check(), loadCanonical(), translate*()
// ---------------------------------------------------------------------------

const sync = await importSync();

// ---------------------------------------------------------------------------
// 1. loadCanonical — reads and validates mcp.servers.json
// ---------------------------------------------------------------------------

describe("loadCanonical", () => {
  it("loads a valid canonical file", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      const result = await sync.loadCanonical(root);
      assert.ok(result.servers, "has servers");
      assert.ok(result.servers.serena, "has serena");
      assert.ok(result.servers.jetbrains, "has jetbrains");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("throws if mcp.servers.json is missing", async () => {
    const root = await makeRoot();
    try {
      await assert.rejects(
        () => sync.loadCanonical(root),
        /mcp\.servers\.json/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("throws if servers field is missing", async () => {
    const root = await makeRoot();
    try {
      await writeFile(join(root, "mcp.servers.json"), JSON.stringify({}));
      await assert.rejects(
        () => sync.loadCanonical(root),
        /servers/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("throws if a stdio server has no command", async () => {
    const root = await makeRoot();
    try {
      await writeFile(
        join(root, "mcp.servers.json"),
        JSON.stringify({ servers: { bad: { type: "stdio" } } })
      );
      await assert.rejects(
        () => sync.loadCanonical(root),
        /command/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("throws if an sse server has no url", async () => {
    const root = await makeRoot();
    try {
      await writeFile(
        join(root, "mcp.servers.json"),
        JSON.stringify({ servers: { bad: { type: "sse" } } })
      );
      await assert.rejects(
        () => sync.loadCanonical(root),
        /url/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("throws if a server has an unknown type", async () => {
    const root = await makeRoot();
    try {
      await writeFile(
        join(root, "mcp.servers.json"),
        JSON.stringify({ servers: { bad: { type: "websocket", url: "ws://x" } } })
      );
      await assert.rejects(
        () => sync.loadCanonical(root),
        /type/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 2. translateForOpenCode — ${HOME} → {env:HOME}, stdio → local, sse → remote
// ---------------------------------------------------------------------------

describe("translateForOpenCode", () => {
  it("translates stdio command ${HOME} references to {env:HOME}", () => {
    const server = {
      type: "stdio",
      command: "${HOME}/.local/bin/uvx",
      args: ["--flag", "value"],
      env: { BROWSER: "/bin/true" },
    };
    const result = sync.translateForOpenCode("serena", server);
    assert.equal(result.type, "local");
    assert.equal(result.command[0], "{env:HOME}/.local/bin/uvx");
    assert.deepEqual(result.command.slice(1), ["--flag", "value"]);
    assert.equal(result.environment.BROWSER, "/bin/true");
  });

  it("translates sse server to remote type", () => {
    const server = { type: "sse", url: "http://127.0.0.1:64342/sse" };
    const result = sync.translateForOpenCode("jetbrains", server);
    assert.equal(result.type, "remote");
    assert.equal(result.url, "http://127.0.0.1:64342/sse");
  });

  it("does not expand ${HOME} — keeps literal {env:HOME}", () => {
    const server = {
      type: "stdio",
      command: "${HOME}/.local/bin/uvx",
      args: [],
    };
    const result = sync.translateForOpenCode("x", server);
    // Must not contain the actual $HOME expansion
    const homeVal = process.env.HOME;
    assert.ok(!result.command[0].includes(homeVal), "must not expand HOME");
    assert.ok(result.command[0].includes("{env:HOME}"), "must use {env:HOME}");
  });

  it("translates ${HOME} in args", () => {
    const server = {
      type: "stdio",
      command: "/usr/bin/env",
      args: ["${HOME}/bin/tool"],
    };
    const result = sync.translateForOpenCode("x", server);
    assert.equal(result.command[1], "{env:HOME}/bin/tool");
  });

  it("translates ${HOME} in env values", () => {
    const server = {
      type: "stdio",
      command: "/usr/bin/env",
      args: [],
      env: { PATH: "${HOME}/.local/bin:/usr/bin" },
    };
    const result = sync.translateForOpenCode("x", server);
    assert.equal(result.environment.PATH, "{env:HOME}/.local/bin:/usr/bin");
  });

  it("maps env to environment field", () => {
    const server = {
      type: "stdio",
      command: "/usr/bin/node",
      args: [],
      env: { FOO: "bar" },
    };
    const result = sync.translateForOpenCode("x", server);
    assert.ok("environment" in result, "has environment");
    assert.equal(result.environment.FOO, "bar");
  });

  it("omits environment when canonical env is absent", () => {
    const server = { type: "stdio", command: "/usr/bin/node", args: [] };
    const result = sync.translateForOpenCode("x", server);
    assert.ok(!("environment" in result), "no environment key when no env");
  });
});

// ---------------------------------------------------------------------------
// 3. translateForClaude — ${HOME} stays as-is (Claude supports it), stdio →
//    command/args structure, sse → url structure
// ---------------------------------------------------------------------------

describe("translateForClaude", () => {
  it("preserves ${HOME} references unchanged (no translation needed)", () => {
    const server = {
      type: "stdio",
      command: "${HOME}/.local/bin/uvx",
      args: ["--flag"],
      env: { BROWSER: "/bin/true" },
    };
    const result = sync.translateForClaude("serena", server);
    assert.equal(result.command, "${HOME}/.local/bin/uvx");
    assert.deepEqual(result.args, ["--flag"]);
    assert.equal(result.env.BROWSER, "/bin/true");
  });

  it("produces command/args/env shape for stdio", () => {
    const server = {
      type: "stdio",
      command: "/usr/bin/node",
      args: ["a", "b"],
      env: { X: "1" },
    };
    const result = sync.translateForClaude("x", server);
    assert.equal(result.command, "/usr/bin/node");
    assert.deepEqual(result.args, ["a", "b"]);
    assert.deepEqual(result.env, { X: "1" });
    assert.ok(!("type" in result), "no type in Claude stdio entry");
  });

  it("produces url shape for sse (no type key in output)", () => {
    const server = { type: "sse", url: "http://127.0.0.1:64342/sse" };
    const result = sync.translateForClaude("jetbrains", server);
    assert.equal(result.url, "http://127.0.0.1:64342/sse");
    // Claude .mcp.json uses no explicit type for SSE — just url
    assert.ok(!("type" in result), "no type in Claude sse entry");
  });

  it("omits env when canonical env is absent", () => {
    const server = { type: "stdio", command: "/usr/bin/node", args: [] };
    const result = sync.translateForClaude("x", server);
    assert.ok(!("env" in result), "no env key when absent");
  });
});

// ---------------------------------------------------------------------------
// 4. generateOpenCode — merges canonical into opencode.json mcp section
// ---------------------------------------------------------------------------

describe("generateOpenCode", () => {
  it("writes projected mcp entries to opencode.json (fresh)", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await writeOpenCode(root, {
        "$schema": "https://opencode.ai/config.json",
        "permission": { "edit": "allow" },
      });
      await sync.generate(root, { dryRun: false, adopt: false });
      const out = await readJSON(join(root, "opencode.json"));
      assert.ok(out.mcp.serena, "serena written");
      assert.ok(out.mcp.jetbrains, "jetbrains written");
      // Verify translation applied
      assert.equal(out.mcp.serena.type, "local");
      assert.equal(out.mcp.serena.command[0], "{env:HOME}/.local/bin/uvx");
      assert.equal(out.mcp.jetbrains.type, "remote");
      // Unrelated fields preserved
      assert.deepEqual(out.permission, { edit: "allow" });
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("writes projected mcp entries to .mcp.json (fresh)", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });
      const out = await readJSON(join(root, ".mcp.json"));
      assert.ok(out.mcpServers.serena, "serena in .mcp.json");
      assert.ok(out.mcpServers.jetbrains, "jetbrains in .mcp.json");
      // Claude preserves ${HOME}
      assert.equal(out.mcpServers.serena.command, "${HOME}/.local/bin/uvx");
      assert.deepEqual(out.mcpServers.serena.args, CANONICAL_SERENA.args);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("is idempotent — running twice produces the same output", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });
      const first = {
        oc: await readJSON(join(root, "opencode.json")),
        cl: await readJSON(join(root, ".mcp.json")),
      };
      await sync.generate(root, { dryRun: false, adopt: false });
      const second = {
        oc: await readJSON(join(root, "opencode.json")),
        cl: await readJSON(join(root, ".mcp.json")),
      };
      assert.deepEqual(first, second, "idempotent");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("preserves unrelated mcp entries in opencode.json", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await writeOpenCode(root, {
        mcp: {
          unrelated: { type: "local", command: ["node", "foo.mjs"] },
        },
      });
      await sync.generate(root, { dryRun: false, adopt: false });
      const out = await readJSON(join(root, "opencode.json"));
      assert.ok(out.mcp.unrelated, "unrelated entry preserved");
      assert.ok(out.mcp.serena, "managed serena present");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("preserves unrelated mcpServers in .mcp.json", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await writeClaudeMcp(root, {
        mcpServers: { other: { command: "other-tool", args: [] } },
      });
      await sync.generate(root, { dryRun: false, adopt: false });
      const out = await readJSON(join(root, ".mcp.json"));
      assert.ok(out.mcpServers.other, "unrelated entry preserved");
      assert.ok(out.mcpServers.serena, "managed serena present");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("dry-run does not write files", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: true, adopt: false });
      assert.ok(
        !existsSync(join(root, "opencode.json")),
        "opencode.json not created in dry-run"
      );
      assert.ok(
        !existsSync(join(root, ".mcp.json")),
        ".mcp.json not created in dry-run"
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("dry-run returns expected projected content", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      const result = await sync.generate(root, { dryRun: true, adopt: false });
      assert.ok(result, "returns result in dry-run");
      assert.ok(result.opencode, "has opencode projection");
      assert.ok(result.claude, "has claude projection");
      assert.ok(result.opencode.mcp.serena, "opencode has serena");
      assert.ok(result.claude.mcpServers.serena, "claude has serena");
    } finally {
      await rm(root, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Conflict detection — refuse to edit existing entries not managed by us
// ---------------------------------------------------------------------------

describe("conflict detection", () => {
  it("fails if opencode.json has a conflicting serena entry without --adopt", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await writeOpenCode(root, {
        mcp: {
          serena: { type: "local", command: ["some-other-command"] },
        },
      });
      await assert.rejects(
        () => sync.generate(root, { dryRun: false, adopt: false }),
        /conflict|managed|serena/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("fails if .mcp.json has a conflicting serena entry without --adopt", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await writeClaudeMcp(root, {
        mcpServers: { serena: { command: "other-serena", args: [] } },
      });
      await assert.rejects(
        () => sync.generate(root, { dryRun: false, adopt: false }),
        /conflict|managed|serena/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("fails if opencode.json has a conflicting jetbrains entry without --adopt", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await writeOpenCode(root, {
        mcp: {
          jetbrains: { type: "remote", url: "http://127.0.0.1:99999/sse" },
        },
      });
      await assert.rejects(
        () => sync.generate(root, { dryRun: false, adopt: false }),
        /conflict|managed|jetbrains/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("succeeds with --adopt for initial migration of existing entries", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await writeOpenCode(root, {
        mcp: {
          serena: { type: "local", command: ["old-serena"] },
        },
      });
      // Should not throw with adopt
      await sync.generate(root, { dryRun: false, adopt: true });
      const out = await readJSON(join(root, "opencode.json"));
      // After adopt, managed entry replaces old
      assert.equal(out.mcp.serena.command[0], "{env:HOME}/.local/bin/uvx");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("treats a correctly projected managed entry as non-conflicting (drift-free)", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      // First generation
      await sync.generate(root, { dryRun: false, adopt: false });
      // Second generation should not conflict
      await sync.generate(root, { dryRun: false, adopt: false });
    } finally {
      await rm(root, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 6. check() — validates that projections match canonical (drift detection)
// ---------------------------------------------------------------------------

describe("check", () => {
  it("check passes when projections are up to date", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });
      const result = await sync.check(root);
      assert.equal(result.ok, true);
      assert.equal(result.drifted.length, 0);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("check detects drift in opencode.json", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });
      // Manually tamper
      const oc = await readJSON(join(root, "opencode.json"));
      oc.mcp.serena.command[0] = "tampered";
      await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
      const result = await sync.check(root);
      assert.equal(result.ok, false);
      assert.ok(result.drifted.some((d) => /opencode/i.test(d)));
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("check detects drift in .mcp.json", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });
      // Manually tamper
      const cl = await readJSON(join(root, ".mcp.json"));
      cl.mcpServers.serena.command = "tampered";
      await writeFile(join(root, ".mcp.json"), JSON.stringify(cl, null, 2));
      const result = await sync.check(root);
      assert.equal(result.ok, false);
      assert.ok(result.drifted.some((d) => /mcp\.json/i.test(d)));
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("check reports missing .mcp.json as drift", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      // Only write opencode.json
      await sync.generate(root, { dryRun: false, adopt: false });
      // Remove .mcp.json
      const { unlink } = await import("node:fs/promises");
      await unlink(join(root, ".mcp.json"));
      const result = await sync.check(root);
      assert.equal(result.ok, false);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("check reports missing opencode.json as drift", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      const result = await sync.check(root);
      assert.equal(result.ok, false);
    } finally {
      await rm(root, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Symlink safety — refuse to write if target is a symlink
// ---------------------------------------------------------------------------

describe("symlink safety", () => {
  it("refuses to write opencode.json if it is a symlink", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      // Create symlink pointing somewhere
      const target = join(root, "opencode.real.json");
      await writeFile(target, JSON.stringify({}));
      const { symlink } = await import("node:fs/promises");
      await symlink(target, join(root, "opencode.json"));
      await assert.rejects(
        () => sync.generate(root, { dryRun: false, adopt: false }),
        /symlink|opencode\.json/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("refuses to write .mcp.json if it is a symlink", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      const target = join(root, "mcp.real.json");
      await writeFile(target, JSON.stringify({}));
      const { symlink } = await import("node:fs/promises");
      await symlink(target, join(root, ".mcp.json"));
      await assert.rejects(
        () => sync.generate(root, { dryRun: false, adopt: false }),
        /symlink|\.mcp\.json/i
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Removed-entry safe semantics — entries removed from canonical are removed
//    from projections (if they were managed)
// ---------------------------------------------------------------------------

describe("removed-entry semantics", () => {
  it("removes a previously managed entry when removed from canonical", async () => {
    const root = await makeRoot();
    try {
      // First: generate with both servers
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });

      // Now update canonical to remove jetbrains
      await writeCanonical(root, {
        servers: { serena: CANONICAL_SERENA },
      });
      await sync.generate(root, { dryRun: false, adopt: false });

      const oc = await readJSON(join(root, "opencode.json"));
      assert.ok(!oc.mcp.jetbrains, "jetbrains removed from opencode.json");

      const cl = await readJSON(join(root, ".mcp.json"));
      assert.ok(!cl.mcpServers.jetbrains, "jetbrains removed from .mcp.json");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("does not remove unrelated entries when a canonical entry is removed", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await writeOpenCode(root, {
        mcp: { unrelated: { type: "local", command: ["node", "other.mjs"] } },
      });
      await sync.generate(root, { dryRun: false, adopt: false });

      // Remove jetbrains from canonical
      await writeCanonical(root, {
        servers: { serena: CANONICAL_SERENA },
      });
      await sync.generate(root, { dryRun: false, adopt: false });

      const oc = await readJSON(join(root, "opencode.json"));
      assert.ok(oc.mcp.unrelated, "unrelated preserved");
      assert.ok(!oc.mcp.jetbrains, "jetbrains removed");
    } finally {
      await rm(root, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Manifest / ownership tracking — managed names known across runs
// ---------------------------------------------------------------------------

describe("manifest tracking", () => {
  it("writes a manifest file recording managed server names", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });
      assert.ok(existsSync(join(root, ".mcp.manifest.json")), "manifest written");
      const manifest = await readJSON(join(root, ".mcp.manifest.json"));
      assert.ok(Array.isArray(manifest.managed), "manifest.managed is array");
      assert.ok(manifest.managed.includes("serena"), "serena in manifest");
      assert.ok(manifest.managed.includes("jetbrains"), "jetbrains in manifest");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("manifest does not list unrelated entries", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await writeOpenCode(root, {
        mcp: { unrelated: { type: "local", command: ["x"] } },
      });
      await sync.generate(root, { dryRun: false, adopt: false });
      const manifest = await readJSON(join(root, ".mcp.manifest.json"));
      assert.ok(!manifest.managed.includes("unrelated"));
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("manifest is updated when servers change", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });

      // Remove jetbrains
      await writeCanonical(root, { servers: { serena: CANONICAL_SERENA } });
      await sync.generate(root, { dryRun: false, adopt: false });

      const manifest = await readJSON(join(root, ".mcp.manifest.json"));
      assert.ok(manifest.managed.includes("serena"), "serena still managed");
      assert.ok(!manifest.managed.includes("jetbrains"), "jetbrains no longer managed");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("uses manifest to identify previously managed entries for safe removal", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });

      // Remove jetbrains from canonical; ensure the manifest allows removal
      await writeCanonical(root, { servers: { serena: CANONICAL_SERENA } });
      // Should not conflict — jetbrains was managed
      await sync.generate(root, { dryRun: false, adopt: false });

      const oc = await readJSON(join(root, "opencode.json"));
      assert.ok(!oc.mcp.jetbrains, "jetbrains removed safely");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("previously managed entry not in canonical and not in target is a no-op removal", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });
      // Manually remove jetbrains from output and manifest — simulate partial state
      const oc = await readJSON(join(root, "opencode.json"));
      delete oc.mcp.jetbrains;
      await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
      // Now remove from canonical too — should succeed without error
      await writeCanonical(root, { servers: { serena: CANONICAL_SERENA } });
      await sync.generate(root, { dryRun: false, adopt: false });
    } finally {
      await rm(root, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Edge cases / env translation
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles a stdio server with no args", () => {
    const server = { type: "stdio", command: "${HOME}/bin/tool", args: [] };
    const result = sync.translateForOpenCode("x", server);
    assert.deepEqual(result.command, ["{env:HOME}/bin/tool"]);
  });

  it("handles a stdio server with no env", () => {
    const server = { type: "stdio", command: "/usr/bin/tool", args: ["a"] };
    const result = sync.translateForOpenCode("x", server);
    assert.ok(!("environment" in result));
  });

  it("handles sse server in opencode — no command/args/env", () => {
    const server = { type: "sse", url: "http://example.com/sse" };
    const result = sync.translateForOpenCode("x", server);
    assert.ok(!("command" in result));
    assert.ok(!("args" in result));
    assert.ok(!("environment" in result));
  });

  it("translates multiple ${HOME} occurrences in one arg value", () => {
    const server = {
      type: "stdio",
      command: "${HOME}/bin/a",
      args: ["${HOME}/b", "${HOME}/c"],
    };
    const result = sync.translateForOpenCode("x", server);
    assert.equal(result.command[1], "{env:HOME}/b");
    assert.equal(result.command[2], "{env:HOME}/c");
  });

  it("check returns ok:true when .mcp.json has no managed servers and canonical has none", async () => {
    const root = await makeRoot();
    try {
      await writeFile(join(root, "mcp.servers.json"), JSON.stringify({ servers: {} }));
      await sync.generate(root, { dryRun: false, adopt: false });
      const result = await sync.check(root);
      assert.equal(result.ok, true);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("generate creates opencode.json from scratch when absent", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });
      assert.ok(existsSync(join(root, "opencode.json")));
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("generate creates .mcp.json from scratch when absent", async () => {
    const root = await makeRoot();
    try {
      await writeCanonical(root);
      await sync.generate(root, { dryRun: false, adopt: false });
      assert.ok(existsSync(join(root, ".mcp.json")));
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
