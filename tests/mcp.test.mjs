/**
 * Tests for bin/sync-mcp.mjs
 *
 * Run: node --test tests/mcp.test.mjs
 *
 * Unit tests use isolated tmp directories; no spawned processes.
 * CLI tests spawn the script as a subprocess (Finding 3).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, symlink, unlink, lstat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
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

async function tmp() { return mkdtemp(join(tmpdir(), "mcp-test-")); }

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
// loadCanonical — shape and validation
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

  it("throws if root is an array", () => withRoot(async (root) => {
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

  it("throws if stdio command is empty string", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio", command: "", args: [] } } }));
    await assert.rejects(sync.loadCanonical(root), /empty|nonempty/i);
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

  it("throws if sse url is empty string", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "sse", url: "" } } }));
    await assert.rejects(sync.loadCanonical(root), /empty|nonempty/i);
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
    await writeFile(join(root, "mcp.servers.json"),
      '{"servers":{"__proto__":{"type":"sse","url":"http://x"}}}');
    await assert.rejects(sync.loadCanonical(root), /reserved/i);
  }));

  it("throws on invalid server name with spaces", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { "bad name": { type: "sse", url: "http://x/sse" } } }));
    await assert.rejects(sync.loadCanonical(root), /name|invalid/i);
  }));

  it("throws on invalid server name starting with digit", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { "1bad": { type: "sse", url: "http://x/sse" } } }));
    await assert.rejects(sync.loadCanonical(root), /name|invalid/i);
  }));

  it("accepts server name with letters digits underscore dash", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { "my-tool_2": { type: "sse", url: "http://x/sse" } } }));
    const c = await sync.loadCanonical(root);
    assert.ok(c.servers["my-tool_2"]);
  }));

  it("throws on ${VAR:-default} interpolation syntax", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio",
        command: "${HOME:-/usr}/bin/tool", args: [] } } }));
    await assert.rejects(sync.loadCanonical(root), /not supported/i);
  }));

  it("throws on ${123} malformed variable name", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio",
        command: "${123}/bin/x", args: [] } } }));
    await assert.rejects(sync.loadCanonical(root), /variable|invalid|\$/i);
  }));

  it("throws on ${foo bar} malformed variable name", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio",
        command: "/bin/x", args: ["${foo bar}"] } } }));
    await assert.rejects(sync.loadCanonical(root), /variable|invalid|\$/i);
  }));

  it("throws on {env:HOME} in canonical (ambiguous with OpenCode syntax)", () => withRoot(async (root) => {
    await writeFile(join(root, "mcp.servers.json"),
      JSON.stringify({ servers: { x: { type: "stdio",
        command: "{env:HOME}/bin/x", args: [] } } }));
    await assert.rejects(sync.loadCanonical(root), /\{env:/i);
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

  it("sse → type:remote, url translated through toOC", () => {
    // url may contain ${VAR} references that must be translated
    const r = sync.translateForOpenCode("x", {
      type: "sse", url: "http://${HOST}/sse",
    });
    assert.equal(r.type, "remote");
    assert.equal(r.url, "http://{env:HOST}/sse");
  });

  it("sse → plain url preserved if no interpolation", () => {
    const r = sync.translateForOpenCode("x", { type: "sse", url: "http://127.0.0.1:64342/sse" });
    assert.equal(r.type, "remote");
    assert.equal(r.url, "http://127.0.0.1:64342/sse");
    assert.ok(!("command" in r));
    assert.ok(!("environment" in r));
  });

  it("sse with headers — header values translated through toOC", () => {
    const r = sync.translateForOpenCode("x", {
      type: "sse", url: "http://h/sse",
      headers: { Authorization: "Bearer ${TOKEN}" },
    });
    assert.equal(r.headers.Authorization, "Bearer {env:TOKEN}");
  });

  it("does not expand ${HOME} at generation time", () => {
    const r = sync.translateForOpenCode("x", {
      type: "stdio", command: "${HOME}/bin/x", args: [],
    });
    assert.ok(!r.command[0].includes(process.env.HOME ?? "__MISSING__"));
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

  it("omits environment when env is empty", () => {
    const r = sync.translateForOpenCode("x", { type: "stdio", command: "/bin/x", args: [], env: {} });
    assert.ok(!("environment" in r));
  });
});

// ---------------------------------------------------------------------------
// translateForClaude
// ---------------------------------------------------------------------------

describe("translateForClaude", () => {
  it("stdio → type:stdio, command string (${VAR} unchanged), args, env", () => {
    const r = sync.translateForClaude("x", {
      type: "stdio", command: "${HOME}/.local/bin/uvx",
      args: ["-p", "3.13"], env: { BROWSER: "/bin/true" },
    });
    assert.equal(r.type, "stdio");
    assert.equal(r.command, "${HOME}/.local/bin/uvx");
    assert.deepEqual(r.args, ["-p", "3.13"]);
    assert.deepEqual(r.env, { BROWSER: "/bin/true" });
  });

  it("sse → type:sse required, url unchanged", () => {
    const r = sync.translateForClaude("x", { type: "sse", url: "http://h/sse" });
    assert.equal(r.type, "sse");
    assert.equal(r.url, "http://h/sse");
    assert.ok(!("command" in r));
    assert.ok(!("env" in r));
  });

  it("sse url with ${VAR} preserved unchanged in Claude", () => {
    const r = sync.translateForClaude("x", { type: "sse", url: "http://${HOST}/sse" });
    assert.equal(r.url, "http://${HOST}/sse");
  });

  it("sse with headers — values preserved unchanged", () => {
    const r = sync.translateForClaude("x", {
      type: "sse", url: "http://h/sse",
      headers: { Authorization: "Bearer ${TOKEN}" },
    });
    assert.equal(r.headers.Authorization, "Bearer ${TOKEN}");
  });

  it("${VAR} preserved unchanged in stdio command", () => {
    const r = sync.translateForClaude("x", { type: "stdio", command: "${HOME}/bin/x", args: [] });
    assert.equal(r.command, "${HOME}/bin/x");
  });

  it("omits env when absent", () => {
    const r = sync.translateForClaude("x", { type: "stdio", command: "/bin/x", args: [] });
    assert.ok(!("env" in r));
  });

  it("omits env when empty", () => {
    const r = sync.translateForClaude("x", { type: "stdio", command: "/bin/x", args: [], env: {} });
    assert.ok(!("env" in r));
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
    assert.equal(cl.mcpServers.serena.type, "stdio");
    assert.equal(cl.mcpServers.serena.command, "${HOME}/.local/bin/uvx");
    assert.deepEqual(cl.mcpServers.serena.args, SRV_SERENA.args);
    assert.deepEqual(cl.mcpServers.serena.env, { BROWSER: "/bin/true" });
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

  it("dry-run returns projected content without writing any files", () => withRoot(async (root) => {
    await wCanonical(root);
    const result = await sync.generate(root, { dryRun: true, adopt: false });
    assert.ok(!existsSync(join(root, "opencode.json")));
    assert.ok(!existsSync(join(root, ".mcp.json")));
    assert.ok(!existsSync(join(root, ".mcp.manifest.json")));
    assert.equal(result.opencode.mcp.serena.type, "local");
    assert.equal(result.claude.mcpServers.serena.type, "stdio");
    assert.equal(result.claude.mcpServers.jetbrains.type, "sse");
  }));
});

// ---------------------------------------------------------------------------
// Idempotence
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

  it("manifest mtime unchanged on idempotent run", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const mfPath = join(root, ".mcp.manifest.json");
    const mtime1 = (await lstat(mfPath)).mtimeMs;
    // Small delay to ensure mtime would differ if written
    await new Promise((r) => setTimeout(r, 10));
    await sync.generate(root, { dryRun: false, adopt: false });
    const mtime2 = (await lstat(mfPath)).mtimeMs;
    assert.equal(mtime1, mtime2, "manifest must not be rewritten on idempotent run");
  }));
});

// ---------------------------------------------------------------------------
// Conflict detection
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

  it("non-conflicting unmanaged entry matching projected value does not fail", () => withRoot(async (root) => {
    await wCanonical(root);
    const projected = sync.translateForOpenCode("serena", SRV_SERENA);
    await wOC(root, { mcp: { serena: projected } });
    await sync.generate(root, { dryRun: false, adopt: false });
  }));

  // Regression: externally-modified previously-managed entry being removed from canonical
  // must not be silently deleted — the external edit means we can't assume ownership
  it("refuses to remove a previously-managed entry that was externally modified after removal from canonical", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    // Externally modify jetbrains in the projection
    const oc = await rJSON(join(root, "opencode.json"));
    oc.mcp.jetbrains.url = "http://external-edit/sse";
    await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
    // Now remove jetbrains from canonical — should detect the external edit before deleting
    await wCanonical(root, { serena: SRV_SERENA });
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /externally modified|adopt/i
    );
  }));

  it("--adopt removes externally-modified previously-managed entry when dropped from canonical", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc = await rJSON(join(root, "opencode.json"));
    oc.mcp.jetbrains.url = "http://external-edit/sse";
    await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
    await wCanonical(root, { serena: SRV_SERENA });
    await sync.generate(root, { dryRun: false, adopt: true });
    const oc2 = await rJSON(join(root, "opencode.json"));
    assert.ok(!oc2.mcp.jetbrains, "externally-modified removed entry deleted with --adopt");
  }));
});

// ---------------------------------------------------------------------------
// Manifest — snapshot-based ownership and schema validation
// ---------------------------------------------------------------------------

describe("manifest", () => {
  it("writes managed list and per-target snapshots", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const mf = await rJSON(join(root, ".mcp.manifest.json"));
    assert.deepEqual(mf.managed.sort(), ["jetbrains", "serena"]);
    assert.ok(mf.snapshots["oc:serena"], "oc:serena snapshot present");
    assert.ok(mf.snapshots["cl:serena"], "cl:serena snapshot present");
    assert.ok(mf.snapshots["oc:jetbrains"], "oc:jetbrains snapshot present");
    assert.ok(mf.snapshots["cl:jetbrains"], "cl:jetbrains snapshot present");
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
    assert.ok(mf.snapshots["oc:serena"]);
    assert.ok(mf.snapshots["cl:serena"]);
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

  it("throws if manifest snapshots is not a plain object", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, ".mcp.manifest.json"),
      JSON.stringify({ managed: [], snapshots: [] }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /snapshots.*plain|plain.*snapshots|plain object/i
    );
  }));

  it("throws if manifest managed contains non-string entry", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, ".mcp.manifest.json"),
      JSON.stringify({ managed: [42], snapshots: {} }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /managed|string/i
    );
  }));

  it("throws if manifest is a symlink", () => withRoot(async (root) => {
    await wCanonical(root);
    const target = join(root, "real-manifest.json");
    await writeFile(target, JSON.stringify({ managed: [], snapshots: {} }));
    await symlink(target, join(root, ".mcp.manifest.json"));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /symlink.*manifest|manifest.*symlink/i
    );
  }));

  it("throws if manifest is a symlink even in check mode", () => withRoot(async (root) => {
    await wCanonical(root);
    const target = join(root, "real-manifest.json");
    await writeFile(target, JSON.stringify({ managed: [], snapshots: {} }));
    await symlink(target, join(root, ".mcp.manifest.json"));
    await assert.rejects(
      sync.check(root),
      /symlink.*manifest|manifest.*symlink/i
    );
  }));
});

// ---------------------------------------------------------------------------
// Removed-entry semantics
// ---------------------------------------------------------------------------

describe("removed-entry semantics", () => {
  it("removes previously managed entry from both projections when canonical shrinks", () => withRoot(async (root) => {
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

  it("no-op when managed entry already absent from target before removal from canonical", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc = await rJSON(join(root, "opencode.json"));
    delete oc.mcp.jetbrains;
    await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
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

  // check must detect when a managed entry is present in the projection but
  // absent in canonical (i.e. the canonical was updated but projections weren't)
  it("detects stale managed entry in projection after canonical removes it", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    // Update canonical to remove jetbrains without re-running generate
    await wCanonical(root, { serena: SRV_SERENA });
    const r = await sync.check(root);
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /jetbrains/.test(d)),
      `expected jetbrains in drifted, got: ${JSON.stringify(r.drifted)}`);
  }));

  // check must detect when manifest is stale (managed list differs from canonical)
  it("detects stale manifest after canonical changes", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    // Update canonical to add a new server without re-running generate
    await wCanonical(root, {
      serena: SRV_SERENA,
      jetbrains: SRV_JETBRAINS,
      newserver: { type: "sse", url: "http://new/sse" },
    });
    const r = await sync.check(root);
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /newserver/.test(d)),
      `expected newserver in drifted, got: ${JSON.stringify(r.drifted)}`);
  }));

  // check does not write any files
  it("check does not modify any files", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const oc1 = await readFile(join(root, "opencode.json"), "utf8");
    const cl1 = await readFile(join(root, ".mcp.json"), "utf8");
    const mf1 = await readFile(join(root, ".mcp.manifest.json"), "utf8");
    // Tamper then check — check must not write
    const oc = JSON.parse(oc1);
    oc.mcp.serena.command[0] = "tampered";
    await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
    await sync.check(root);
    // opencode.json should still have the tampered value (check did not rewrite)
    const oc2 = await rJSON(join(root, "opencode.json"));
    assert.equal(oc2.mcp.serena.command[0], "tampered");
    assert.equal(await readFile(join(root, ".mcp.json"), "utf8"), cl1);
    assert.equal(await readFile(join(root, ".mcp.manifest.json"), "utf8"), mf1);
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
// JSON target structure guards and null handling
// ---------------------------------------------------------------------------

describe("target file structure guards", () => {
  it("throws if opencode.json contains JSON null", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, "opencode.json"), "null");
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /plain object|null/i
    );
  }));

  it("throws if .mcp.json contains JSON null", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, ".mcp.json"), "null");
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /plain object|null/i
    );
  }));

  it("throws if opencode.json contains a JSON array at root", () => withRoot(async (root) => {
    await wCanonical(root);
    await writeFile(join(root, "opencode.json"), "[]");
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

  it("malformed destination leaves other files unchanged", () => withRoot(async (root) => {
    // Write canonical and a valid .mcp.json; corrupt opencode.json
    // Verify .mcp.json is not touched after the error
    await wCanonical(root);
    const validCl = { mcpServers: { other: { type: "stdio", command: "x", args: [] } } };
    await wCL(root, validCl);
    await writeFile(join(root, "opencode.json"), "{ broken }");
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /invalid JSON/i
    );
    // .mcp.json must be untouched
    const cl = await rJSON(join(root, ".mcp.json"));
    assert.deepEqual(cl, validCl);
    // manifest must not have been written
    assert.ok(!existsSync(join(root, ".mcp.manifest.json")));
  }));
});

// ---------------------------------------------------------------------------
// Generic ${VAR} interpolation and validation
// ---------------------------------------------------------------------------

describe("variable interpolation", () => {
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

  it("translates ${VAR} in SSE url for OpenCode", () => {
    const r = sync.translateForOpenCode("x", {
      type: "sse", url: "http://${API_HOST}/sse",
    });
    assert.equal(r.url, "http://{env:API_HOST}/sse");
  });

  it("translates ${VAR} in SSE header values for OpenCode", () => {
    const r = sync.translateForOpenCode("x", {
      type: "sse", url: "http://h/sse",
      headers: { Authorization: "Bearer ${TOKEN}" },
    });
    assert.equal(r.headers.Authorization, "Bearer {env:TOKEN}");
  });

  it("preserves ${VAR} unchanged in Claude stdio output", () => {
    const r = sync.translateForClaude("x", {
      type: "stdio", command: "${MYVAR}/bin/x", args: ["${A}"],
      env: { K: "${V}" },
    });
    assert.equal(r.command, "${MYVAR}/bin/x");
    assert.equal(r.args[0], "${A}");
    assert.equal(r.env.K, "${V}");
  });

  it("preserves ${VAR} in SSE url unchanged in Claude output", () => {
    const r = sync.translateForClaude("x", {
      type: "sse", url: "http://${API_HOST}/sse",
    });
    assert.equal(r.url, "http://${API_HOST}/sse");
  });

  it("preserves ${VAR} in SSE header values unchanged in Claude output", () => {
    const r = sync.translateForClaude("x", {
      type: "sse", url: "http://h/sse",
      headers: { Authorization: "Bearer ${TOKEN}" },
    });
    assert.equal(r.headers.Authorization, "Bearer ${TOKEN}");
  });
});

// ---------------------------------------------------------------------------
// Finding 1 — loadManifest: deeper snapshot ownership validation
// ---------------------------------------------------------------------------

describe("manifest snapshot ownership validation", () => {
  it("throws when managed is non-empty but snapshots key is absent", () => withRoot(async (root) => {
    await wCanonical(root);
    // Write manifest with managed entry but no snapshots key at all
    await writeFile(join(root, ".mcp.manifest.json"),
      JSON.stringify({ managed: ["serena"] }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /snapshots/i
    );
    // Destinations must not have been created
    assert.ok(!existsSync(join(root, "opencode.json")));
    assert.ok(!existsSync(join(root, ".mcp.json")));
  }));

  it("throws when managed entry is missing its oc: snapshot", () => withRoot(async (root) => {
    await wCanonical(root);
    // Only provide cl: snapshot, not oc:
    const clSnap = sync.translateForClaude("serena", SRV_SERENA);
    await writeFile(join(root, ".mcp.manifest.json"),
      JSON.stringify({ managed: ["serena"], snapshots: { "cl:serena": clSnap } }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /oc:serena|missing snapshot/i
    );
    assert.ok(!existsSync(join(root, "opencode.json")));
    assert.ok(!existsSync(join(root, ".mcp.json")));
  }));

  it("throws when managed entry is missing its cl: snapshot", () => withRoot(async (root) => {
    await wCanonical(root);
    const ocSnap = sync.translateForOpenCode("serena", SRV_SERENA);
    await writeFile(join(root, ".mcp.manifest.json"),
      JSON.stringify({ managed: ["serena"], snapshots: { "oc:serena": ocSnap } }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /cl:serena|missing snapshot/i
    );
    assert.ok(!existsSync(join(root, "opencode.json")));
    assert.ok(!existsSync(join(root, ".mcp.json")));
  }));

  it("throws when a snapshot value is null (not a plain object)", () => withRoot(async (root) => {
    await wCanonical(root);
    const clSnap = sync.translateForClaude("serena", SRV_SERENA);
    await writeFile(join(root, ".mcp.manifest.json"), JSON.stringify({
      managed: ["serena"],
      snapshots: { "oc:serena": null, "cl:serena": clSnap },
    }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /plain object/i
    );
    assert.ok(!existsSync(join(root, "opencode.json")));
    assert.ok(!existsSync(join(root, ".mcp.json")));
  }));

  it("throws when a snapshot value is an array (not a plain object)", () => withRoot(async (root) => {
    await wCanonical(root);
    const ocSnap = sync.translateForOpenCode("serena", SRV_SERENA);
    const clSnap = sync.translateForClaude("serena", SRV_SERENA);
    await writeFile(join(root, ".mcp.manifest.json"), JSON.stringify({
      managed: ["serena"],
      snapshots: { "oc:serena": ocSnap, "cl:serena": [] },
    }));
    await assert.rejects(
      sync.generate(root, { dryRun: false, adopt: false }),
      /plain object/i
    );
    assert.ok(!existsSync(join(root, "opencode.json")));
    assert.ok(!existsSync(join(root, ".mcp.json")));
  }));

  it("empty managed with absent snapshots key is allowed (fresh manifest)", () => withRoot(async (root) => {
    await wCanonical(root, {});
    // managed:[] with no snapshots is valid — treat as fresh state
    await writeFile(join(root, ".mcp.manifest.json"),
      JSON.stringify({ managed: [] }));
    // Should not throw
    await sync.generate(root, { dryRun: false, adopt: false });
  }));
});

// ---------------------------------------------------------------------------
// Finding 2 — check: manifest-to-canonical comparison
// ---------------------------------------------------------------------------

describe("check manifest-to-canonical comparison", () => {
  it("missing manifest is drift even when destination files match canonical", () => withRoot(async (root) => {
    await wCanonical(root, { serena: SRV_SERENA });
    // Write destinations correctly without going through generate (no manifest)
    const ocEntry = sync.translateForOpenCode("serena", SRV_SERENA);
    const clEntry = sync.translateForClaude("serena", SRV_SERENA);
    await wOC(root, { mcp: { serena: ocEntry } });
    await wCL(root, { mcpServers: { serena: clEntry } });
    const r = await sync.check(root);
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /manifest.*missing|missing.*manifest/i.test(d)),
      `expected missing-manifest drift, got: ${JSON.stringify(r.drifted)}`);
  }));

  it("stale empty manifest is drift when canonical has servers", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    // Reset manifest to empty (simulating a hand-edit that cleared it)
    await writeFile(join(root, ".mcp.manifest.json"),
      JSON.stringify({ managed: [], snapshots: {} }));
    const r = await sync.check(root);
    assert.equal(r.ok, false);
    // Should report that canonical servers are not tracked in manifest
    assert.ok(r.drifted.some((d) => /manifest/i.test(d) && (/serena|jetbrains/.test(d))),
      `expected canonical servers reported in manifest drift, got: ${JSON.stringify(r.drifted)}`);
  }));

  it("manifest with extra tracked entry that canonical dropped is drift", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    // Now shrink canonical but leave manifest untouched (simulate: generate not re-run)
    await wCanonical(root, { serena: SRV_SERENA });
    const r = await sync.check(root);
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /jetbrains/i.test(d)),
      `expected jetbrains drift, got: ${JSON.stringify(r.drifted)}`);
  }));

  it("manifest snapshot mismatch with canonical is drift (not a conflict error)", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    // Silently update canonical without regenerating — snapshots in manifest are now stale
    const newSrv = { type: "sse", url: "http://new-jetbrains/sse" };
    await wCanonical(root, { serena: SRV_SERENA, jetbrains: newSrv });
    const r = await sync.check(root);
    // Must return drift, not throw
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /jetbrains/.test(d)),
      `expected jetbrains snapshot drift, got: ${JSON.stringify(r.drifted)}`);
  }));

  it("ok after correct generate — manifest matches canonical exactly", () => withRoot(async (root) => {
    await wCanonical(root);
    await sync.generate(root, { dryRun: false, adopt: false });
    const r = await sync.check(root);
    assert.equal(r.ok, true);
    assert.deepEqual(r.drifted, []);
  }));
});

// ---------------------------------------------------------------------------
// Finding 3 — CLI: strict argument parser
// ---------------------------------------------------------------------------

// Helper: spawn the script and collect exit code + output
function runCli(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => { stdout += d; });
    p.stderr.on("data", (d) => { stderr += d; });
    p.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("CLI strict argument parser", () => {
  it("unknown flag exits nonzero before any I/O", () => withRoot(async (root) => {
    await wCanonical(root);
    const r = await runCli(["--unknown-flag", "--root", root]);
    assert.notEqual(r.code, 0, "exit code must be nonzero");
    assert.ok(/unknown/i.test(r.stderr), `stderr should mention unknown: ${r.stderr}`);
    assert.ok(!existsSync(join(root, "opencode.json")), "opencode.json must not be created");
    assert.ok(!existsSync(join(root, ".mcp.json")), ".mcp.json must not be created");
    assert.ok(!existsSync(join(root, ".mcp.manifest.json")), "manifest must not be created");
  }));

  it("--check=true (equals-form) is rejected as unknown", () => withRoot(async (root) => {
    await wCanonical(root);
    const r = await runCli(["--check=true", "--root", root]);
    assert.notEqual(r.code, 0);
    assert.ok(/unknown/i.test(r.stderr), `stderr should mention unknown: ${r.stderr}`);
  }));

  it("--root without a following value exits nonzero", () => withRoot(async (root) => {
    const r = await runCli(["--root"]);
    assert.notEqual(r.code, 0);
    assert.ok(/root/i.test(r.stderr), `stderr should mention root: ${r.stderr}`);
  }));

  it("--root followed by another flag is rejected", () => withRoot(async (root) => {
    const r = await runCli(["--root", "--check"]);
    assert.notEqual(r.code, 0);
    assert.ok(/root/i.test(r.stderr), `stderr should mention root: ${r.stderr}`);
  }));

  it("--check and --adopt together exit nonzero", () => withRoot(async (root) => {
    await wCanonical(root);
    const r = await runCli(["--check", "--adopt", "--root", root]);
    assert.notEqual(r.code, 0);
    assert.ok(/mutually exclusive|check.*adopt|adopt.*check/i.test(r.stderr),
      `stderr should mention conflict: ${r.stderr}`);
  }));

  it("--check and --dry-run together exit nonzero", () => withRoot(async (root) => {
    await wCanonical(root);
    const r = await runCli(["--check", "--dry-run", "--root", root]);
    assert.notEqual(r.code, 0);
    assert.ok(/mutually exclusive|check.*dry|dry.*check/i.test(r.stderr),
      `stderr should mention conflict: ${r.stderr}`);
  }));

  it("positional argument is rejected as unknown", () => withRoot(async (root) => {
    const r = await runCli(["foo", "--root", root]);
    assert.notEqual(r.code, 0);
    assert.ok(/unexpected|unknown/i.test(r.stderr), `stderr: ${r.stderr}`);
  }));

  it("valid generate (no servers) exits zero and writes files", () => withRoot(async (root) => {
    await wCanonical(root, {});
    const r = await runCli(["--root", root]);
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr: ${r.stderr}`);
    assert.ok(existsSync(join(root, "opencode.json")));
    assert.ok(existsSync(join(root, ".mcp.json")));
    assert.ok(existsSync(join(root, ".mcp.manifest.json")));
  }));

  it("valid --check after generate exits zero", () => withRoot(async (root) => {
    await wCanonical(root, {});
    await runCli(["--root", root]);
    const r = await runCli(["--check", "--root", root]);
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr: ${r.stderr}`);
    assert.ok(/up to date/i.test(r.stdout), `stdout: ${r.stdout}`);
  }));

  it("--check exits nonzero on drift and does not modify files", () => withRoot(async (root) => {
    await wCanonical(root);
    await runCli(["--root", root]);
    const mfBefore = await readFile(join(root, ".mcp.manifest.json"), "utf8");
    // Tamper a destination
    const oc = JSON.parse(await readFile(join(root, "opencode.json"), "utf8"));
    oc.mcp.serena.command[0] = "tampered-by-test";
    await writeFile(join(root, "opencode.json"), JSON.stringify(oc, null, 2));
    const r = await runCli(["--check", "--root", root]);
    assert.notEqual(r.code, 0, "exit code must be nonzero on drift");
    assert.ok(/DRIFT/i.test(r.stderr), `stderr should mention DRIFT: ${r.stderr}`);
    // manifest must be unchanged
    assert.equal(await readFile(join(root, ".mcp.manifest.json"), "utf8"), mfBefore);
  }));

  it("bad args do not modify pre-existing files", () => withRoot(async (root) => {
    await wCanonical(root);
    await wOC(root, { permission: { edit: "allow" } });
    const ocBefore = await readFile(join(root, "opencode.json"), "utf8");
    await runCli(["--unknown-flag", "--root", root]);
    const ocAfter = await readFile(join(root, "opencode.json"), "utf8");
    assert.equal(ocBefore, ocAfter, "opencode.json must be unchanged after bad args");
  }));
});
