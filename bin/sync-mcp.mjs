#!/usr/bin/env node
/**
 * bin/sync-mcp.mjs — MCP projection generator
 *
 * Reads the canonical mcp.servers.json and projects it into:
 *   - opencode.json  (OpenCode — type:local/remote, {env:HOME} refs)
 *   - .mcp.json      (Claude — command/args/env, ${HOME} refs kept as-is)
 *
 * A .mcp.manifest.json records which server names are managed by this tool.
 * Only managed entries are touched; all other settings/servers are preserved.
 *
 * Usage:
 *   node bin/sync-mcp.mjs [--check] [--root <dir>] [--adopt] [--dry-run]
 *
 * Flags:
 *   --check      Validate projections match canonical; exit 1 if drifted
 *   --root <d>   Use <d> as the project root (default: process.cwd())
 *   --adopt      Allow initial adoption of pre-existing managed-name entries
 *   --dry-run    Print what would be written; do not write files
 *
 * No third-party dependencies.
 */

import {
  readFile,
  writeFile,
  lstat,
  access,
  constants,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANONICAL_FILE = "mcp.servers.json";
const OPENCODE_FILE = "opencode.json";
const CLAUDE_FILE = ".mcp.json";
const MANIFEST_FILE = ".mcp.manifest.json";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a single server entry from the canonical file.
 * @param {string} name
 * @param {unknown} entry
 */
function validateServerEntry(name, entry) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Server "${name}": entry must be an object`);
  }
  const e = /** @type {Record<string, unknown>} */ (entry);
  const type = e.type;
  if (type !== "stdio" && type !== "sse") {
    throw new Error(
      `Server "${name}": unsupported type "${type}". Must be "stdio" or "sse"`
    );
  }
  if (type === "stdio") {
    if (!e.command || typeof e.command !== "string") {
      throw new Error(
        `Server "${name}": stdio server must have a "command" string`
      );
    }
    if (!Array.isArray(e.args)) {
      throw new Error(
        `Server "${name}": stdio server must have an "args" array`
      );
    }
  }
  if (type === "sse") {
    if (!e.url || typeof e.url !== "string") {
      throw new Error(`Server "${name}": sse server must have a "url" string`);
    }
  }
}

// ---------------------------------------------------------------------------
// loadCanonical — parse and validate mcp.servers.json
// ---------------------------------------------------------------------------

/**
 * @param {string} root
 * @returns {Promise<{servers: Record<string, object>}>}
 */
export async function loadCanonical(root) {
  const path = join(root, CANONICAL_FILE);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(
      `Cannot read mcp.servers.json at "${path}": ${err.message}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`mcp.servers.json is not valid JSON: ${err.message}`);
  }

  if (!parsed || typeof parsed !== "object" || !parsed.servers) {
    throw new Error(
      `mcp.servers.json must have a "servers" object at the top level`
    );
  }

  if (typeof parsed.servers !== "object" || Array.isArray(parsed.servers)) {
    throw new Error(`mcp.servers.json "servers" must be a plain object`);
  }

  for (const [name, entry] of Object.entries(parsed.servers)) {
    validateServerEntry(name, entry);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Translation helpers
// ---------------------------------------------------------------------------

/** Replace all ${HOME} occurrences with {env:HOME} (OpenCode syntax). */
function toOpenCodeRef(str) {
  return str.replaceAll("${HOME}", "{env:HOME}");
}

/**
 * Translate a canonical server entry to OpenCode format.
 *
 * stdio → type:local, command:[translated-cmd, ...args], environment:{...}
 * sse   → type:remote, url
 *
 * @param {string} name
 * @param {object} server
 * @returns {object}
 */
export function translateForOpenCode(name, server) {
  const s = /** @type {Record<string, any>} */ (server);

  if (s.type === "stdio") {
    const cmd = toOpenCodeRef(s.command);
    const args = (s.args ?? []).map((a) => toOpenCodeRef(String(a)));
    const result = {
      type: "local",
      command: [cmd, ...args],
    };
    if (s.env && Object.keys(s.env).length > 0) {
      result.environment = Object.fromEntries(
        Object.entries(s.env).map(([k, v]) => [k, toOpenCodeRef(String(v))])
      );
    }
    return result;
  }

  if (s.type === "sse") {
    return { type: "remote", url: s.url };
  }

  throw new Error(`translateForOpenCode: unknown type "${s.type}" for "${name}"`);
}

/**
 * Translate a canonical server entry to Claude .mcp.json format.
 *
 * stdio → {command, args, [env]}  (no "type" key; ${HOME} kept as-is)
 * sse   → {url}                   (no "type" key)
 *
 * @param {string} name
 * @param {object} server
 * @returns {object}
 */
export function translateForClaude(name, server) {
  const s = /** @type {Record<string, any>} */ (server);

  if (s.type === "stdio") {
    const result = {
      command: s.command,
      args: s.args ?? [],
    };
    if (s.env && Object.keys(s.env).length > 0) {
      result.env = { ...s.env };
    }
    return result;
  }

  if (s.type === "sse") {
    return { url: s.url };
  }

  throw new Error(`translateForClaude: unknown type "${s.type}" for "${name}"`);
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

/** @param {string} path */
async function readJsonFile(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

/** @param {string} path */
async function readJsonFileOrNull(path) {
  try {
    return await readJsonFile(path);
  } catch {
    return null;
  }
}

/**
 * Guard: refuse to operate on a symlink.
 * @param {string} path
 * @param {string} label
 */
async function assertNotSymlink(path, label) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Refusing to write ${label}: "${path}" is a symlink. ` +
          `Remove or replace it with a regular file first.`
      );
    }
  } catch (err) {
    // File does not exist — that is fine
    if (err.code === "ENOENT") return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Manifest — tracks which server names are managed by sync-mcp
// ---------------------------------------------------------------------------

/** @param {string} root */
async function loadManifest(root) {
  const path = join(root, MANIFEST_FILE);
  const data = await readJsonFileOrNull(path);
  if (!data || !Array.isArray(data.managed)) {
    return { managed: [] };
  }
  return data;
}

/**
 * @param {string} root
 * @param {string[]} managed
 */
async function writeManifest(root, managed) {
  const path = join(root, MANIFEST_FILE);
  const content = { managed: [...managed].sort() };
  await writeFile(path, JSON.stringify(content, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Check for conflicting entries in a target object.
 *
 * A conflict occurs when a canonical name exists in the target but is not
 * in the manifest (previously managed) and the current value does not match
 * the expected projected value.
 *
 * @param {Record<string, unknown>} target  existing mcp entries from file
 * @param {Record<string, unknown>} projected  what we would write
 * @param {string[]} managed  previously managed names
 * @param {boolean} adopt  if true, override conflicts
 * @param {string} targetLabel  label for error messages
 * @returns {string[]} list of conflict descriptions
 */
function detectConflicts(target, projected, managed, adopt, targetLabel) {
  if (adopt) return [];
  const conflicts = [];
  for (const name of Object.keys(projected)) {
    if (!(name in target)) continue; // no existing entry — no conflict
    if (managed.includes(name)) continue; // we manage it — safe to update
    // Exists, not managed: compare current vs projected
    const current = JSON.stringify(target[name]);
    const expected = JSON.stringify(projected[name]);
    if (current !== expected) {
      conflicts.push(
        `${targetLabel}: entry "${name}" exists and was not created by sync-mcp. ` +
          `Use --adopt to take ownership. (conflict)`
      );
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// generate — core projection logic
// ---------------------------------------------------------------------------

/**
 * @typedef {object} GenerateOptions
 * @property {boolean} [dryRun]
 * @property {boolean} [adopt]
 */

/**
 * Generate projections from canonical mcp.servers.json.
 *
 * @param {string} root
 * @param {GenerateOptions} [opts]
 * @returns {Promise<{opencode: object, claude: object} | undefined>}
 */
export async function generate(root, opts = {}) {
  const dryRun = opts.dryRun ?? false;
  const adopt = opts.adopt ?? false;

  // 1. Load canonical
  const canonical = await loadCanonical(root);
  const servers = canonical.servers;

  // 2. Load manifest (previously managed names)
  const manifest = await loadManifest(root);
  const previouslyManaged = manifest.managed;

  // 3. Translate all entries
  const ocProjected = {}; // opencode projections
  const clProjected = {}; // claude projections
  for (const [name, server] of Object.entries(servers)) {
    ocProjected[name] = translateForOpenCode(name, server);
    clProjected[name] = translateForClaude(name, server);
  }

  // 4. Load existing files
  const ocPath = join(root, OPENCODE_FILE);
  const clPath = join(root, CLAUDE_FILE);

  // Symlink guards (before reading, before conflict detection)
  if (!dryRun) {
    await assertNotSymlink(ocPath, OPENCODE_FILE);
    await assertNotSymlink(clPath, CLAUDE_FILE);
  }

  const existingOc = (await readJsonFileOrNull(ocPath)) ?? {};
  const existingCl = (await readJsonFileOrNull(clPath)) ?? {};

  const existingOcMcp = existingOc.mcp ?? {};
  const existingClMcp = existingCl.mcpServers ?? {};

  // 5. Conflict detection
  const ocConflicts = detectConflicts(
    existingOcMcp,
    ocProjected,
    previouslyManaged,
    adopt,
    OPENCODE_FILE
  );
  const clConflicts = detectConflicts(
    existingClMcp,
    clProjected,
    previouslyManaged,
    adopt,
    CLAUDE_FILE
  );
  const allConflicts = [...ocConflicts, ...clConflicts];
  if (allConflicts.length > 0) {
    throw new Error(allConflicts.join("\n"));
  }

  // 6. Build new mcp sections
  //    - Start from existing, preserving unrelated entries
  //    - Remove previously managed entries that are no longer in canonical
  //    - Apply new projections

  const newOcMcp = { ...existingOcMcp };
  const newClMcp = { ...existingClMcp };

  // Remove stale managed entries (previously managed, now absent from canonical)
  for (const name of previouslyManaged) {
    if (!(name in servers)) {
      delete newOcMcp[name];
      delete newClMcp[name];
    }
  }

  // Apply projections
  Object.assign(newOcMcp, ocProjected);
  Object.assign(newClMcp, clProjected);

  // 7. Build final file objects
  const newOc = { ...existingOc, mcp: newOcMcp };
  const newCl = { ...existingCl, mcpServers: newClMcp };

  // 8. Dry-run: return without writing
  if (dryRun) {
    return { opencode: newOc, claude: newCl };
  }

  // 9. Write files
  await writeFile(ocPath, JSON.stringify(newOc, null, 2) + "\n");
  await writeFile(clPath, JSON.stringify(newCl, null, 2) + "\n");

  // 10. Update manifest
  await writeManifest(root, Object.keys(servers));

  return { opencode: newOc, claude: newCl };
}

// ---------------------------------------------------------------------------
// check — detect drift between canonical and projections
// ---------------------------------------------------------------------------

/**
 * @param {string} root
 * @returns {Promise<{ok: boolean, drifted: string[]}>}
 */
export async function check(root) {
  const drifted = [];

  // Generate what we expect (dry run)
  let expected;
  try {
    expected = await generate(root, { dryRun: true, adopt: false });
  } catch (err) {
    // If generation itself fails (e.g. canonical missing), report as drift
    drifted.push(`Cannot generate expected projections: ${err.message}`);
    return { ok: false, drifted };
  }

  if (!expected) {
    drifted.push("generate() returned nothing in dry-run mode");
    return { ok: false, drifted };
  }

  const ocPath = join(root, OPENCODE_FILE);
  const clPath = join(root, CLAUDE_FILE);

  // Check opencode.json
  const existingOc = await readJsonFileOrNull(ocPath);
  if (!existingOc) {
    drifted.push(`${OPENCODE_FILE} is missing`);
  } else {
    const expectedOcMcp = expected.opencode.mcp ?? {};
    const actualOcMcp = existingOc.mcp ?? {};
    for (const name of Object.keys(expectedOcMcp)) {
      if (JSON.stringify(actualOcMcp[name]) !== JSON.stringify(expectedOcMcp[name])) {
        drifted.push(`${OPENCODE_FILE}: entry "${name}" has drifted`);
      }
    }
  }

  // Check .mcp.json
  const existingCl = await readJsonFileOrNull(clPath);
  if (!existingCl) {
    drifted.push(`${CLAUDE_FILE} is missing`);
  } else {
    const expectedClMcp = expected.claude.mcpServers ?? {};
    const actualClMcp = existingCl.mcpServers ?? {};
    for (const name of Object.keys(expectedClMcp)) {
      if (JSON.stringify(actualClMcp[name]) !== JSON.stringify(expectedClMcp[name])) {
        drifted.push(`${CLAUDE_FILE}: entry "${name}" has drifted`);
      }
    }
  }

  return { ok: drifted.length === 0, drifted };
}

// ---------------------------------------------------------------------------
// CLI entrypoint (when run directly)
// ---------------------------------------------------------------------------

// ESM main-module detection
const mainUrl = import.meta.url;
// process.argv[1] may be a relative or absolute path; normalise to file URL
let argvUrl = "";
try {
  if (process.argv[1]) {
    argvUrl = new URL(
      process.argv[1].startsWith("/")
        ? `file://${process.argv[1]}`
        : process.argv[1]
    ).href;
  }
} catch {
  argvUrl = "";
}

if (mainUrl === argvUrl || process.argv[1]?.endsWith("sync-mcp.mjs")) {
  const args = process.argv.slice(2);
  const doCheck = args.includes("--check");
  const dryRun = args.includes("--dry-run");
  const adopt = args.includes("--adopt");
  const rootIdx = args.indexOf("--root");
  const root =
    rootIdx !== -1 && args[rootIdx + 1]
      ? args[rootIdx + 1]
      : process.cwd();

  if (doCheck) {
    check(root)
      .then(({ ok, drifted }) => {
        if (ok) {
          console.log("ok — projections are up to date");
          process.exit(0);
        } else {
          console.error("DRIFT detected:");
          for (const d of drifted) console.error(`  - ${d}`);
          process.exit(1);
        }
      })
      .catch((err) => {
        console.error("Error:", err.message);
        process.exit(1);
      });
  } else {
    generate(root, { dryRun, adopt })
      .then((result) => {
        if (dryRun && result) {
          console.log("Dry-run — would write:");
          console.log("\nopencode.json:");
          console.log(JSON.stringify(result.opencode, null, 2));
          console.log("\n.mcp.json:");
          console.log(JSON.stringify(result.claude, null, 2));
        } else if (!dryRun) {
          console.log("Generated projections:");
          console.log(`  ${OPENCODE_FILE}`);
          console.log(`  ${CLAUDE_FILE}`);
          console.log(`  ${MANIFEST_FILE}`);
        }
        process.exit(0);
      })
      .catch((err) => {
        console.error("Error:", err.message);
        process.exit(1);
      });
  }
}
