/**
 * Tests for bin/sync-mcp.mjs
 *
 * Run: node --test tests/mcp.test.mjs
 *
 * All I/O uses isolated tmp directories; no spawned processes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, symlink, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(new URL("../bin/sync-mcp.mjs", import.meta.url).pathname);
let _seq = 0;
const imp = () => import(`${SCRIPT}?_=${++_seq}`);
const sync = await imp();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SRV_SERENA = {
  type: "stdio",
  command: "${HOME}/.local/bin/uvx",
  args: ["-p", "3.13", "--from", "git+https://github.com/oraios/serena",
         "serena", "start-mcp-server", "--context=ide",
         "--open-web-dashboard=false", "--project-from-cwd"],
  env: { BROWSER: "/bin/true" },
};

const SRV_JETBRAINS = { type: "sse", url: "http://127.0.0.1:64342/sse" };

async function tmp() {
  return mkdtemp(join(tmpdir(), "mcp-test-"));
}

async function wCanonical(root, servers = { serena: SRV_SERENA, jetbrains: SRV_JETBRAINS }) {
  await writeFile(join(root, "mcp.servers.json"), JSON.stringify({ servers }, null, 2));
}

async function wOC(root, content) {
  await writeFile(join(root, "opencode.json"), JSON.stringify(content, null, 2));
}

async function wCL(root, content) {
  await writeFile(join(root, ".mcp.json"), JSON.stringify(content, null, 2));
}

async function rJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function withRoot(fn) {
  const root = await tmp();
  try { return await fn(root); }
  finally { await rm(root, { recursive: true }); }
}

// ---------------------------------------------------------------------------
// loadCanonical — shape validation
// ---------------------------------------------------------------------------

describe("loadCanonical", () => {
  it("parses a valid canonical file", () => withRoot(async (root) => {
    await wCanonical(root);
    const c = await sync.loadCanonical(root);
    assert.equal(c.servers.serena.type, "stdio");
    assert.equal(c.servers.jetbrains.type, "sse");
  }));

  it("throws ENOENT error mentioning filename", () => withRoot(async (root) => {
    await assert.rejects(sync.loadCanonical(root), /mcp\.servers\.json/);
  }));

  it("throws on invalid JSON", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"), "{ bad json }");
    await assert.rejects(sync.loadCanonical(root), /invalid JSON/i);
  }));

  it("throws if root is an array not object", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"), JSON.stringify([]));
    await assert.rejects(sync.loadCanonical(root), /plain object/i);
  }));

  it("throws if servers field is missing", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"), JSON.stringify({ other: 1 }));
    await assert.rejects(sync.loadCanonical(root), /servers/i);
  }));

  it("throws if servers is an array", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"), JSON.stringify({ servers: [] }));
    await assert.rejects(sync.loadCanonical(root), /plain object/i);
  }));

  it("throws if stdio server has no command", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio", args: [] } } }));
    await assert.rejects(sync.loadCanonical(root), /command/i);
  }));

  it("throws if stdio command is not a string", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio", command: 42, args: [] } } }));
    await assert.rejects(sync.loadCanonical(root), /string/i);
  }));

  it("throws if stdio args is not an array", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio", command: "/bin/x", args: "str" } } }));
    await assert.rejects(sync.loadCanonical(root), /args/i);
  }));

  it("throws if a stdio arg element is not a string", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio", command: "/bin/x", args: [1, 2] } } }));
    await assert.rejects(sync.loadCanonical(root), /string/i);
  }));

  it("throws if env value is not a string", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio", command: "/bin/x", args: [],
        env: { FOO: 123 } } } }));
    await assert.rejects(sync.loadCanonical(root), /string/i);
  }));

  it("throws if sse server has no url", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "sse" } } }));
    await assert.rejects(sync.loadCanonical(root), /url/i);
  }));

  it("throws if sse url is not a string", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "sse", url: 99 } } }));
    await assert.rejects(sync.loadCanonical(root), /string/i);
  }));

  it("throws on unknown type", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "websocket", url: "ws://x" } } }));
    await assert.rejects(sync.loadCanonical(root), /type/i);
  }));

  it("throws on unknown key in stdio server", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio", command: "/bin/x", args: [], extra: 1 } } }));
    await assert.rejects(sync.loadCanonical(root), /unknown key/i);
  }));

  it("throws on unknown key in sse server", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "sse", url: "http://x/sse", rogue: true } } }));
    await assert.rejects(sync.loadCanonical(root), /unknown key/i);
  }));

  it("throws on reserved server name __proto__", () => withRoot(async (root) => {
    // Can't use JSON key __proto__ safely; write raw
    await writeFile(join(root, "mcp.servers.json"),
      '{"servers":{"__proto__":{"type":"sse","url":"http://x"}}}');
    await assert.rejects(sync.loadCanonical(root), /reserved/i);
  }));

  it("throws on ${VAR:-default} interpolation syntax", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio",
        command: "${HOME:-/usr}/bin/tool", args: [] } } }));
    await assert.rejects(sync.loadCanonical(root), /not supported/i);
  }));

  it("accepts sse server with headers", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "sse",
        url: "http://x/sse", headers: { Authorization: "Bearer tok" } } } }));
    const c = await sync.loadCanonical(root);
    assert.equal(c.servers.x.headers.Authorization, "Bearer tok");
  }));

  it("throws if headers value is not a string", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "sse",
        url: "http://x/sse", headers: { Tok: 42 } } } }));
    await assert.rejects(sync.loadCanonical(root), /string/i);
  }));
});

// ---------------------------------------------------------------------------
// translateForOpenCode
// ---------------------------------------------------------------------------

describe("translateForOpenCode", () => {
  it("stdio → type:local, command array, ${VAR} → {env:VAR}", () => {
    const r = sync.translateForOpenCode("x", {
      type: "stdio", command: "${HOME}/.local/bin/uvx",
      args: ["-p", "3.13"], env: { BROWSER: "/bin/true" },
    });
    assert.equal(r.type, "local");
    assert.deepEqual(r.command, ["{env:HOME}/.local/bin/uvx", "-p", "3.13"]);
    assert.deepEqual(r.environment, { BROWSER: "/bin/true" });
  });

  it("sse → type:remote, url preserved", () => {
    const r = sync.translateForOpenCode("x", { type: "sse", url: "http://h/sse" });
    assert.equal(r.type, "remote");
    assert.equal(r.url, "http://h/sse");
    assert.ok(!("command" in r));
    assert.ok(!("environment" in r));
  });

  it("does not expand ${HOME} — uses literal process env at runtime", () => {
    const r = sync.translateForOpenCode("x", {
      type: "stdio", command: "${HOME}/bin/x", args: [],
    });
    assert.ok(!r.command[0].includes(process.env.HOME ?? "__MISSING__"),
      "must not expand HOME at generation time");
    assert.equal(r.command[0], "{env:HOME}/bin/x");
  });

  it("translates ${VAR} in args", () => {
    const r = sync.translateForOpenCode("x", {
      type: "stdio", command: "/bin/x", args: ["${MYVAR}/path"],
    });
    assert.equal(r.command[1], "{env:MYVAR}/path");
  });

  it("translates ${VAR} in env values", () => {
    const r = sync.translateForOpenCode("x", {
      type: "stdio", command: "/bin/x", args: [],
      env: { PATH: "${HOME}/.local/bin:${PATH}" },
    });
    assert.equal(r.environment.PATH, "{env:HOME}/.local/bin:{env:PATH}");
  });

  it("omits environment when env absent", () => {
    const r = sync.translateForOpenCode("x", { type: "stdio", command: "/bin/x", args: [] });
    assert.ok(!("environment" in r));
  });

  it("omits environment when env is empty object", () => {
    const r = sync.translateForOpenCode("x", { type: "stdio", command: "/bin/x", args: [], env: {} });
    assert.ok(!("environment" in r));
  });

  it("sse with headers preserved as-is", () => {
    const r = sync.translateForOpenCode("x", {
      type: "sse", url: "http://h/sse", headers: { Authorization: "Bearer t" },
    });
    assert.deepEqual(r.headers, { Authorization: "Bearer t" });
  });
});

// ---------------------------------------------------------------------------
// translateForClaude
// ---------------------------------------------------------------------------

describe("translateForClaude", () => {
  it("stdio → type:stdio, command string, args, env", () => {
    const r = sync.translateForClaude("x", {
      type: "stdio", command: "${HOME}/.local/bin/uvx",
      args: ["-p", "3.13"], env: { BROWSER: "/bin/true" },
    });
    assert.equal(r.type, "stdio");
    assert.equal(r.command, "${HOME}/.local/bin/uvx");
    assert.deepEqual(r.args, ["-p", "3.13"]);
    assert.deepEqual(r.env, { BROWSER: "/bin/true" });
  });

  it("sse → type:sse, url — type field required", () => {
    const r = sync.translateForClaude("x", { type: "sse", url: "http://h/sse" });
    assert.equal(r.type, "sse");
    assert.equal(r.url, "http://h/sse");
    assert.ok(!("command" in r));
    assert.ok(!("env" in r));
  });

  it("${VAR} preserved unchanged in stdio command", () => {
    const r = sync.translateForClaude("x", {
      type: "stdio", command: "${HOME}/bin/x", args: [],
    });
    assert.equal(r.command, "${HOME}/bin/x");
  });

  it("omits env when absent", () => {
    const r = sync.translateForClaude("x", { type: "stdio", command: "/bin/x", args: [] });
    assert.ok(!("env" in r));
  });

  it("omits env when env is empty object", () => {
    const r = sync.translateForClaude("x", { type: "stdio", command: "/bin/x", args: [], env: {} });
    assert.ok(!("env" in r));
  });

  it("sse with headers", () => {
    const r = sync.translateForClaude("x", {
      type: "sse", url: "http://h/sse", headers: { Authorization: "Bearer t" },
    });
    assert.deepEqual(r.headers, { Authorization: "Bearer t" });
  });
});

// ---------------------------------------------------------------------------
// generate — correct projection shape
// ---------------------------------------------------------------------------

describe("generate — projection shape", () => {
  it("fresh run writes correct opencode.json structure", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc = await rJSON(join(root, "opencode.json"));
    assert.equal(oc.mcp.serena.type, "local");
    assert.equal(oc.mcp.serena.command[0], "{env:HOME}/.local/bin/uvx");
    assert.equal(oc.mcp.serena.environment.BROWSER, "/bin/true");
    assert.equal(oc.mcp.jetbrains.type, "remote");
    assert.equal(oc.mcp.jetbrains.url, "http://127.0.0.1:64342/sse");
  }));

  it("fresh run writes correct .mcp.json structure", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const cl = await rJSON(join(root, ".mcp.json"));
    // stdio: type:stdio required
    assert.equal(cl.mcpServers.serena.type, "stdio");
    assert.equal(cl.mcpServers.serena.command, "${HOME}/.local/bin/uvx");
    assert.deepEqual(cl.mcpServers.serena.args, SRV_SERENA.args);
    assert.deepEqual(cl.mcpServers.serena.env, { BROWSER: "/bin/true" });
    // sse: type:sse required
    assert.equal(cl.mcpServers.jetbrains.type, "sse");
    assert.equal(cl.mcpServers.jetbrains.url, "http://127.0.0.1:64342/sse");
  }));

  it("preserves unrelated opencode.json settings", () => withRoot(async (root) => {
    await wCanonical(root);
    await wOC(root, { permission: { edit: "allow" }, mcp: {} });
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc = await rJSON(join(root, "opencode.json"));
    assert.deepEqual(oc.permission, { edit: "allow" });
  }));

  it("preserves unrelated opencode.json mcp entries", () => withRoot(async (root) => {
    await wCanonical(root);
    await wOC(root, { mcp: { other: { type: "local", command: ["node", "x.mjs"] } } });
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc = await rJSON(join(root, "opencode.json"));
    assert.deepEqual(oc.mcp.other, { type: "local", command: ["node", "x.mjs"] });
    assert.ok(oc.mcp.serena);
  }));

  it("preserves unrelated .mcp.json mcpServers entries", () => withRoot(async (root) => {
    await wCanonical(root);
    await wCL(root, { mcpServers: { other: { type: "stdio", command: "x", args: [] } } });
    await sync.generate(root, { dryRun: false, adopt: false });
    const cl = await rJSON(join(root, ".mcp.json"));
    assert.deepEqual(cl.mcpServers.other, { type: "stdio", command: "x", args: [] });
    assert.ok(cl.mcpServers.serena);
  }));

  it("dry-run returns projected content without writing", () => withRoot(async (root) => {
    await wCanonical(root);
    const result = await sync.generate(root, { dryRun: true, adopt: false });
    assert.ok(!existsSync(join(root, "opencode.json")));
    assert.ok(!existsSync(join(root, ".mcp.json")));
    assert.equal(result.opencode.mcp.serena.type, "local");
    assert.equal(result.claude.mcpServers.serena.type, "stdio");
    assert.equal(result.claude.mcpServers.jetbrains.type, "sse");
  }));
});

// ---------------------------------------------------------------------------
// Idempotence — no writes when content unchanged
// ---------------------------------------------------------------------------

describe("idempotence", () => {
  it("second run produces byte-identical files", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc1 = await readFile(join(root, "opencode.json"), "utf8");
    const cl1 = await readFile(join(root, ".mcp.json"), "utf8");
    const mf1 = await readFile(join(root, ".mcp.manifest.json"), "utf8");
    await sync.generate(root, { dryRun: false, adopt: false });
    assert.equal(await readFile(join(root, "opencode.json"), "utf8"), oc1);
    assert.equal(await readFile(join(root, ".mcp.json"), "utf8"), cl1);
    assert.equal(await readFile(join(root, ".mcp.manifest.json"), "utf8"), mf1);
  }));
});

// ---------------------------------------------------------------------------
// Conflict detection — snapshot-based
// ---------------------------------------------------------------------------

describe("conflict detection", () => {
  it("rejects unmanaged conflicting serena in opencode.json", () => withRoot(async (root) => {
    await wCanonical(root);
    await wOC(root, { mcp: { serena: { type: "local", command: ["other"] } } });
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /serena.*not managed|not managed.*serena|adopt/i
    );
  }));

  it("rejects unmanaged conflicting jetbrains in .mcp.json", () => withRoot(async (root) => {
    await wCanonical(root);
    await wCL(root, { mcpServers: { jetbrains: { type: "sse", url: "http://other/sse" } } });
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /jetbrains.*not managed|not managed.*jetbrains|adopt/i
    );
  }));

  it("--adopt overrides conflict on initial migration", () => withRoot(async (root) => {
    await wCanonical(root);
    await wOC(root, { mcp: { serena: { type: "local", command: ["old"] } } });
    await sync.generate(root, { dryRun: false, adopt: true });
    const oc = await rJSON(join(root, "opencode.json"));
    assert.equal(oc.mcp.serena.command[0], "{env:HOME}/.local/bin/uvx");
  }));

  it("rejects externally modified managed entry without --adopt", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    // Externally tamper with the managed serena entry
    const oc = await rJSON(join(root, "opencode.json"));
    oc.mcp.serena.command[0] = "externally-changed";
    await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /externally modified|adopt/i
    );
  }));

  it("--adopt allows overwriting externally modified managed entry", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc = await rJSON(join(root, "opencode.json"));
    oc.mcp.serena.command[0] = "externally-changed";
    await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
    await sync.generate(root, { dryRun: false, adopt: true });
    const oc2 = await rJSON(join(root, "opencode.json"));
    assert.equal(oc2.mcp.serena.command[0], "{env:HOME}/.local/bin/uvx");
  }));

  it("second run with unchanged managed entries does not conflict", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    await sync.generate(root, { dryRun: false, adopt: false });
  }));

  it("non-conflicting unmanaged entry (same value) does not fail", () => withRoot(async (root) => {
    await wCanonical(root);
    // Write an entry that already matches what we'd project
    const projected = sync.translateForOpenCode("serena", SRV_SERENA);
    await wOC(root, { mcp: { serena: projected } });
    // Should not throw — value matches projected
    await sync.generate(root, { dryRun: false, adopt: false });
  }));
});

// ---------------------------------------------------------------------------
// Manifest — snapshot-based ownership
// ---------------------------------------------------------------------------

describe("manifest", () => {
  it("writes managed list and per-target snapshots", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const mf = await rJSON(join(root, ".mcp.manifest.json"));
    assert.deepEqual(mf.managed.sort(), ["jetbrains", "serena"]);
    assert.ok(mf.snapshots["oc:serena"]);
    assert.ok(mf.snapshots["cl:serena"]);
    assert.ok(mf.snapshots["oc:jetbrains"]);
    assert.ok(mf.snapshots["cl:jetbrains"]);
    // Snapshot content must match projected values
    assert.deepEqual(mf.snapshots["oc:serena"], sync.translateForOpenCode("serena", SRV_SERENA));
    assert.deepEqual(mf.snapshots["cl:jetbrains"], sync.translateForClaude("jetbrains", SRV_JETBRAINS));
  }));

  it("manifest does not include unrelated entries", () => withRoot(async (root) => {
    await wCanonical(root);
    await wOC(root, { mcp: { unrelated: { type: "local", command: ["x"] } } });
    await sync.generate(root, { dryRun: false, adopt: false });
    const mf = await rJSON(join(root, ".mcp.manifest.json"));
    assert.ok(!mf.managed.includes("unrelated"));
    assert.ok(!mf.snapshots["oc:unrelated"]);
  }));

  it("manifest updated when server removed from canonical", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    await wCanonical(root, { serena: SRV_SERENA });
    await sync.generate(root, { dryRun: false, adopt: false });
    const mf = await rJSON(join(root, ".mcp.manifest.json"));
    assert.deepEqual(mf.managed, ["serena"]);
    assert.ok(!mf.snapshots["oc:jetbrains"]);
    assert.ok(!mf.snapshots["cl:jetbrains"]);
  }));

  it("throws on malformed manifest JSON", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, ".mcp.manifest.json"), "{ broken");
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /invalid JSON/i
    );
  }));

  it("throws if manifest managed is not an array", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, ".mcp.manifest.json"),
      JSON.stringify({ managed: "bad", snapshots: {} }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /managed.*array|array/i
    );
  }));
});

// ---------------------------------------------------------------------------
// Removed-entry semantics
// ---------------------------------------------------------------------------

describe("removed-entry semantics", () => {
  it("removes previously managed entry from both projections when dropped from canonical", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    await wCanonical(root, { serena: SRV_SERENA });
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc = await rJSON(join(root, "opencode.json"));
    const cl = await rJSON(join(root, ".mcp.json"));
    assert.ok(!oc.mcp.jetbrains, "jetbrains removed from opencode.json");
    assert.ok(!cl.mcpServers.jetbrains, "jetbrains removed from .mcp.json");
  }));

  it("does not remove unrelated entries when canonical shrinks", () => withRoot(async (root) => {
    await wCanonical(root);
    await wOC(root, { mcp: { unrelated: { type: "local", command: ["x"] } } });
    await sync.generate(root, { dryRun: false, adopt: false });
    await wCanonical(root, { serena: SRV_SERENA });
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc = await rJSON(join(root, "opencode.json"));
    assert.ok(oc.mcp.unrelated, "unrelated preserved");
    assert.ok(!oc.mcp.jetbrains, "jetbrains gone");
  }));

  it("no-op when managed entry already absent from target", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    // Remove jetbrains from file manually
    const oc = await rJSON(join(root, "opencode.json"));
    delete oc.mcp.jetbrains;
    await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
    // Now drop from canonical — should succeed
    await wCanonical(root, { serena: SRV_SERENA });
    await sync.generate(root, { dryRun: false, adopt: false });
  }));
});

// ---------------------------------------------------------------------------
// check — drift detection
// ---------------------------------------------------------------------------

describe("check", () => {
  it("ok when projections are up to date", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const r = await sync.check(root);
    assert.equal(r.ok, true);
    assert.deepEqual(r.drifted, []);
  }));

  it("detects drift in opencode.json managed entry", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc = await rJSON(join(root, "opencode.json"));
    oc.mcp.serena.command[0] = "tampered";
    await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
    const r = await sync.check(root);
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /opencode\.json/i.test(d) && /serena/.test(d)));
  }));

  it("detects drift in .mcp.json managed entry", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const cl = await rJSON(join(root, ".mcp.json"));
    cl.mcpServers.jetbrains.url = "http://tampered/sse";
    await writeFile(join(root, ".mcp.json"), JSON.stringify(cl, null, 2));
    const r = await sync.check(root);
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /\.mcp\.json/i.test(d) && /jetbrains/.test(d)));
  }));

  it("reports missing opencode.json as not-ok", () => withRoot(async (root) => {
    await wCanonical(root);
    const r = await sync.check(root);
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /opencode\.json/.test(d)));
  }));

  it("reports missing .mcp.json as not-ok", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    await unlink(join(root, ".mcp.json"));
    const r = await sync.check(root);
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /\.mcp\.json/.test(d)));
  }));

  it("ok when canonical has no servers and files are empty projections", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"), JSON.stringify({ servers: {} }));
    await sync.generate(root, { dryRun: false, adopt: false });
    const r = await sync.check(root);
    assert.equal(r.ok, true);
  }));
});

// ---------------------------------------------------------------------------
// Symlink safety
// ---------------------------------------------------------------------------

describe("symlink safety", () => {
  it("refuses to write opencode.json if it is a symlink", () => withRoot(async (root) => {
    await wCanonical(root);
    const target = join(root, "real.json");
    await writeFile(target, "{}");
    await symlink(target, join(root, "opencode.json"));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /symlink.*opencode\.json|opencode\.json.*symlink/i
    );
  }));

  it("refuses to write .mcp.json if it is a symlink", () => withRoot(async (root) => {
    await wCanonical(root);
    const target = join(root, "real2.json");
    await writeFile(target, "{}");
    await symlink(target, join(root, ".mcp.json"));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /symlink.*\.mcp\.json|\.mcp\.json.*symlink/i
    );
  }));
});

// ---------------------------------------------------------------------------
// JSON target structure guards
// ---------------------------------------------------------------------------

describe("target file structure guards", () => {
  it("throws if opencode.json contains a JSON array at root", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, "opencode.json"), "[]");
    // readJsonFile returns the parsed value; generate merges using spread — array spread is wrong
    // The generate function uses { ...existingOc } which silently ignores array indexes.
    // We want this to fail. The corrected generate must validate the target root is an object.
    // This test documents and enforces that contract.
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /plain object|invalid|array/i
    );
  }));

  it("throws if .mcp.json mcpServers is an array", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, ".mcp.json"), JSON.stringify({ mcpServers: [] }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /plain object|invalid|array/i
    );
  }));

  it("throws if opencode.json mcp is an array", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, "opencode.json"), JSON.stringify({ mcp: [] }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /plain object|invalid|array/i
    );
  }));

  it("throws on malformed opencode.json", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, "opencode.json"), "{ not json }");
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /invalid JSON/i
    );
  }));

  it("throws on malformed .mcp.json", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, ".mcp.json"), "{ not json }");
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /invalid JSON/i
    );
  }));
});

// ---------------------------------------------------------------------------
// Generic ${VAR} interpolation
// ---------------------------------------------------------------------------

describe("generic variable interpolation", () => {
  it("translates ${MYVAR} in command for OpenCode", () => {
    const r = sync.translateForOpenCode("x", {
      type: "stdio", command: "${MYVAR}/bin/x", args: [],
    });
    assert.equal(r.command[0], "{env:MYVAR}/bin/x");
  });

  it("translates multiple different ${VAR} in one arg", () => {
    const r = sync.translateForOpenCode("x", {
      type: "stdio", command: "/bin/x", args: ["${A}/${B}"],
    });
    assert.equal(r.command[1], "{env:A}/{env:B}");
  });

  it("translates ${VAR} in env values for OpenCode", () => {
    const r = sync.translateForOpenCode("x", {
      type: "stdio", command: "/bin/x", args: [],
      env: { COMBINED: "${PREFIX}:${SUFFIX}" },
    });
    assert.equal(r.environment.COMBINED, "{env:PREFIX}:{env:SUFFIX}");
  });

  it("preserves ${VAR} unchanged in Claude output", () => {
    const r = sync.translateForClaude("x", {
      type: "stdio", command: "${MYVAR}/bin/x", args: ["${A}"],
      env: { K: "${V}" },
    });
    assert.equal(r.command, "${MYVAR}/bin/x");
    assert.equal(r.args[0], "${A}");
    assert.equal(r.env.K, "${V}");
  });
});
