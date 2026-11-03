#!/usr/bin/env node
/**
 * bin/sync-mcp.mjs — MCP projection generator
 *
 * Reads canonical mcp.servers.json and projects it into:
 *   opencode.json  — type:local/remote, {env:VAR} references
 *   .mcp.json      — type:stdio/sse, ${VAR} references kept as-is
 *
 * .mcp.manifest.json records managed names and per-target projected snapshots.
 * Only managed entries are touched; all other settings/servers are preserved.
 *
 * Usage:
 *   node bin/sync-mcp.mjs [--check] [--root <dir>] [--adopt] [--dry-run]
 *
 * No third-party dependencies.
 */

import { readFile, writeFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const CANONICAL_FILE = "mcp.servers.json";
const OPENCODE_FILE  = "opencode.json";
const CLAUDE_FILE    = ".mcp.json";
const MANIFEST_FILE  = ".mcp.manifest.json";

const RESERVED_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const STDIO_KEYS     = new Set(["type", "command", "args", "env"]);
const SSE_KEYS       = new Set(["type", "url", "headers"]);

// Valid server name: identifier-like, starts with letter or underscore,
// followed by letters, digits, underscores, or hyphens.
const VALID_SERVER_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

// Valid ${VAR} variable name: must be a valid shell identifier (letter/underscore start).
const VALID_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Validation helpers

function assertStr(val, label) {
  if (typeof val !== "string") throw new Error(`${label} must be a string`);
  if (val.length === 0) throw new Error(`${label} must be nonempty (empty string not allowed)`);
  // Reject ${VAR:-default} syntax
  if (/\$\{[^}]*:-[^}]*\}/.test(val))
    throw new Error(`${label}: \${VAR:-default} syntax is not supported`);
  // Reject {env:...} in canonical — that is OpenCode output syntax, not input
  if (/\{env:[^}]*\}/.test(val))
    throw new Error(`${label}: {env:VAR} syntax is not allowed in canonical; use \${VAR}`);
  // Validate any ${...} references: inner name must be a valid identifier
  for (const m of val.matchAll(/\$\{([^}]*)\}/g)) {
    if (!VALID_VAR_NAME.test(m[1]))
      throw new Error(`${label}: invalid variable name in \${${m[1]}}`);
  }
}

function assertPlain(val, label) {
  if (val === null || val === undefined || typeof val !== "object" || Array.isArray(val))
    throw new Error(`${label} must be a plain object`);
}

function assertStringMap(obj, label) {
  assertPlain(obj, label);
  for (const [k, v] of Object.entries(obj)) assertStr(v, `${label}.${k}`);
}

function validateServerEntry(name, entry) {
  assertPlain(entry, `Server "${name}"`);
  const { type } = entry;
  if (type !== "stdio" && type !== "sse")
    throw new Error(`Server "${name}": type must be "stdio" or "sse", got ${JSON.stringify(type)}`);
  const allowed = type === "stdio" ? STDIO_KEYS : SSE_KEYS;
  for (const k of Object.keys(entry))
    if (!allowed.has(k)) throw new Error(`Server "${name}": unknown key "${k}" for type "${type}"`);
  if (type === "stdio") {
    assertStr(entry.command, `Server "${name}".command`);
    if (!Array.isArray(entry.args)) throw new Error(`Server "${name}".args must be an array`);
    entry.args.forEach((a, i) => assertStr(a, `Server "${name}".args[${i}]`));
    if (entry.env !== undefined) assertStringMap(entry.env, `Server "${name}".env`);
  } else {
    assertStr(entry.url, `Server "${name}".url`);
    if (entry.headers !== undefined) assertStringMap(entry.headers, `Server "${name}".headers`);
  }
}

// loadCanonical

export async function loadCanonical(root) {
  const path = join(root, CANONICAL_FILE);
  let raw;
  try { raw = await readFile(path, "utf8"); }
  catch (err) {
    if (err.code === "ENOENT") throw new Error(`mcp.servers.json not found at "${path}"`);
    throw err;
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (err) { throw new Error(`mcp.servers.json: invalid JSON: ${err.message}`); }
  assertPlain(parsed, "mcp.servers.json root");
  assertPlain(parsed.servers, 'mcp.servers.json "servers"');
  for (const [name, entry] of Object.entries(parsed.servers)) {
    if (RESERVED_NAMES.has(name)) throw new Error(`Server name "${name}" is reserved`);
    if (!VALID_SERVER_NAME.test(name))
      throw new Error(`Server name "${name}" is invalid; must match [A-Za-z_][A-Za-z0-9_-]*`);
    validateServerEntry(name, entry);
  }
  return parsed;
}

// Translation

const toOC = (s) => s.replace(/\$\{([^}]+)\}/g, (_, v) => `{env:${v}}`);
const mapStr = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
const nonempty = (obj) => obj && Object.keys(obj).length > 0;

export function translateForOpenCode(_name, server) {
  if (server.type === "stdio") {
    const result = { type: "local", command: [toOC(server.command), ...(server.args ?? []).map(toOC)] };
    if (nonempty(server.env)) result.environment = mapStr(server.env, toOC);
    return result;
  }
  // sse → remote; translate ${VAR} in url and header values
  const result = { type: "remote", url: toOC(server.url) };
  if (nonempty(server.headers)) result.headers = mapStr(server.headers, toOC);
  return result;
}

export function translateForClaude(_name, server) {
  if (server.type === "stdio") {
    const result = { type: "stdio", command: server.command, args: server.args ?? [] };
    if (nonempty(server.env)) result.env = { ...server.env };
    return result;
  }
  // sse → sse; ${VAR} kept as-is for Claude
  const result = { type: "sse", url: server.url };
  if (nonempty(server.headers)) result.headers = { ...server.headers };
  return result;
}

// I/O helpers

async function readJSON(path) {
  let raw;
  try { raw = await readFile(path, "utf8"); }
  catch (err) { if (err.code === "ENOENT") return null; throw err; }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (err) { throw new Error(`${path}: invalid JSON: ${err.message}`); }
  // JSON null is not a valid target file (assertPlain would catch it, but ?? {} masks it)
  if (parsed === null) throw new Error(`${path}: must be a plain object, got null`);
  return parsed;
}

async function assertNotSymlink(path, label) {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error(`Refusing to write ${label}: "${path}" is a symlink`);
  } catch (err) { if (err.code !== "ENOENT") throw err; }
}

function assertTargetShape(obj, file, mcp_key) {
  assertPlain(obj, `${file} root`);
  if (obj[mcp_key] !== undefined) assertPlain(obj[mcp_key], `${file} "${mcp_key}"`);
}

// Manifest

async function assertManifestNotSymlink(root) {
  const path = join(root, MANIFEST_FILE);
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error(`Refusing to use manifest: "${path}" is a symlink`);
  } catch (err) { if (err.code !== "ENOENT") throw err; }
}

async function loadManifest(root) {
  // Guard before reading — symlink check applies in all code paths
  await assertManifestNotSymlink(root);
  let raw;
  try { raw = await readFile(join(root, MANIFEST_FILE), "utf8"); }
  catch (err) { if (err.code === "ENOENT") return { managed: [], snapshots: {} }; throw err; }
  let data;
  try { data = JSON.parse(raw); }
  catch (err) { throw new Error(`${MANIFEST_FILE}: invalid JSON: ${err.message}`); }
  if (!Array.isArray(data?.managed))
    throw new Error(`${MANIFEST_FILE}: "managed" must be an array`);
  for (const item of data.managed)
    if (typeof item !== "string")
      throw new Error(`${MANIFEST_FILE}: "managed" entries must be strings`);
  if (data.snapshots !== undefined) assertPlain(data.snapshots, `${MANIFEST_FILE} "snapshots"`);
  return { managed: data.managed, snapshots: data.snapshots ?? {} };
}

async function writeManifest(root, managed, snapshots) {
  const path = join(root, MANIFEST_FILE);
  const content = JSON.stringify({ managed: [...managed].sort(), snapshots }, null, 2) + "\n";
  // Guard before writing
  await assertNotSymlink(path, MANIFEST_FILE);
  let cur;
  try { cur = await readFile(path, "utf8"); } catch { /**/ }
  if (content !== cur) await writeFile(path, content);
}

// Conflict detection (snapshot-based)
// Checks entries in `projected` as well as entries in `prevManaged` that are absent
// from `newServers` (i.e. being removed).

function detectConflicts(current, projected, prevManaged, newServers, snapshots, adopt, label) {
  if (adopt) return [];
  const conflicts = [];

  // Check entries that will be written (projected)
  for (const name of Object.keys(projected)) {
    if (!(name in current)) continue;
    const snap = snapshots[name];
    const cur = JSON.stringify(current[name]);
    if (snap === undefined) {
      if (cur !== JSON.stringify(projected[name]))
        conflicts.push(`${label}: "${name}" exists and is not managed by sync-mcp; use --adopt`);
    } else if (cur !== JSON.stringify(snap)) {
      conflicts.push(`${label}: "${name}" was externally modified since last sync; use --adopt to overwrite`);
    }
  }

  // Check entries that were previously managed but are being removed from canonical
  for (const name of prevManaged) {
    if (name in newServers) continue;   // still present — handled above
    if (!(name in current)) continue;   // already absent — no conflict
    const snap = snapshots[name];
    if (snap === undefined) continue;   // was never snapshotted — skip
    const cur = JSON.stringify(current[name]);
    if (cur !== JSON.stringify(snap))
      conflicts.push(`${label}: "${name}" was externally modified since last sync; use --adopt to overwrite`);
  }

  return conflicts;
}

// generate

export async function generate(root, opts = {}) {
  const dryRun = opts.dryRun ?? false;
  const adopt  = opts.adopt  ?? false;

  const { servers } = await loadCanonical(root);
  const { managed: prevManaged, snapshots } = await loadManifest(root);

  const ocProjected = {};
  const clProjected = {};
  for (const [n, s] of Object.entries(servers)) {
    ocProjected[n] = translateForOpenCode(n, s);
    clProjected[n] = translateForClaude(n, s);
  }

  const ocPath = join(root, OPENCODE_FILE);
  const clPath = join(root, CLAUDE_FILE);

  if (!dryRun) {
    await assertNotSymlink(ocPath, OPENCODE_FILE);
    await assertNotSymlink(clPath, CLAUDE_FILE);
  }

  const existingOc = (await readJSON(ocPath)) ?? {};
  const existingCl = (await readJSON(clPath)) ?? {};
  assertTargetShape(existingOc, OPENCODE_FILE, "mcp");
  assertTargetShape(existingCl, CLAUDE_FILE, "mcpServers");

  const ocSnaps = Object.fromEntries(
    Object.entries(snapshots).filter(([k]) => k.startsWith("oc:")).map(([k, v]) => [k.slice(3), v])
  );
  const clSnaps = Object.fromEntries(
    Object.entries(snapshots).filter(([k]) => k.startsWith("cl:")).map(([k, v]) => [k.slice(3), v])
  );

  const conflicts = [
    ...detectConflicts(existingOc.mcp ?? {}, ocProjected, prevManaged, servers, ocSnaps, adopt, OPENCODE_FILE),
    ...detectConflicts(existingCl.mcpServers ?? {}, clProjected, prevManaged, servers, clSnaps, adopt, CLAUDE_FILE),
  ];
  if (conflicts.length > 0) throw new Error(conflicts.join("\n"));

  const newOcMcp = { ...existingOc.mcp };
  const newClMcp = { ...existingCl.mcpServers };
  for (const n of prevManaged) { if (!(n in servers)) { delete newOcMcp[n]; delete newClMcp[n]; } }
  Object.assign(newOcMcp, ocProjected);
  Object.assign(newClMcp, clProjected);

  const newOc = { ...existingOc, mcp: newOcMcp };
  const newCl = { ...existingCl, mcpServers: newClMcp };

  if (dryRun) return { opencode: newOc, claude: newCl };

  const ocStr = JSON.stringify(newOc, null, 2) + "\n";
  const clStr = JSON.stringify(newCl, null, 2) + "\n";
  let curOc, curCl;
  try { curOc = await readFile(ocPath, "utf8"); } catch { /**/ }
  try { curCl = await readFile(clPath, "utf8"); } catch { /**/ }
  if (ocStr !== curOc) await writeFile(ocPath, ocStr);
  if (clStr !== curCl) await writeFile(clPath, clStr);

  const newSnaps = {};
  for (const n of Object.keys(servers)) {
    newSnaps[`oc:${n}`] = ocProjected[n];
    newSnaps[`cl:${n}`] = clProjected[n];
  }
  await writeManifest(root, Object.keys(servers), newSnaps);

  return { opencode: newOc, claude: newCl };
}

// check

export async function check(root) {
  // Manifest symlink guard must propagate as a hard error (not swallowed into drifted)
  await assertManifestNotSymlink(root);

  let expected;
  try { expected = await generate(root, { dryRun: true, adopt: false }); }
  catch (err) { return { ok: false, drifted: [`Cannot compute expected state: ${err.message}`] }; }

  // Load manifest to know which names were managed (needed to detect stale removed entries)
  let prevManaged = [];
  try {
    const mf = await loadManifest(root);
    prevManaged = mf.managed;
  } catch { /**/ }

  const drifted = [];
  for (const [file, path, mcp_key, expObj] of [
    [OPENCODE_FILE, join(root, OPENCODE_FILE), "mcp",        expected.opencode],
    [CLAUDE_FILE,   join(root, CLAUDE_FILE),   "mcpServers", expected.claude],
  ]) {
    const actual = await readJSON(path);
    if (!actual) { drifted.push(`${file} is missing`); continue; }
    const exp = expObj[mcp_key] ?? {};
    const act = actual[mcp_key] ?? {};
    // Check managed entries that should be present
    for (const n of Object.keys(exp))
      if (JSON.stringify(act[n]) !== JSON.stringify(exp[n]))
        drifted.push(`${file}: "${n}" has drifted`);
    // Check previously-managed entries that should now be absent (removed from canonical)
    for (const n of prevManaged)
      if (!(n in exp) && n in act)
        drifted.push(`${file}: "${n}" is stale (removed from canonical but still present in projection)`);
  }
  return { ok: drifted.length === 0, drifted };
}

// CLI

let argvUrl = "";
try {
  if (process.argv[1])
    argvUrl = new URL(process.argv[1].startsWith("/") ? `file://${process.argv[1]}` : process.argv[1]).href;
} catch { /**/ }

if (import.meta.url === argvUrl || process.argv[1]?.endsWith("sync-mcp.mjs")) {
  const args   = process.argv.slice(2);
  const doCheck = args.includes("--check");
  const dryRun  = args.includes("--dry-run");
  const adopt   = args.includes("--adopt");
  const ri      = args.indexOf("--root");
  const root    = ri !== -1 && args[ri + 1] ? args[ri + 1] : process.cwd();

  const run = doCheck
    ? check(root).then(({ ok, drifted }) => {
        if (ok) { console.log("ok — projections are up to date"); return; }
        console.error("DRIFT detected:");
        for (const d of drifted) console.error(`  - ${d}`);
        process.exitCode = 1;
      })
    : generate(root, { dryRun, adopt }).then((result) => {
        if (dryRun && result) {
          console.log("Dry-run — would write:\n\nopencode.json:");
          console.log(JSON.stringify(result.opencode, null, 2));
          console.log("\n.mcp.json:");
          console.log(JSON.stringify(result.claude, null, 2));
        } else if (!dryRun) {
          console.log(`Generated: ${OPENCODE_FILE}  ${CLAUDE_FILE}  ${MANIFEST_FILE}`);
        }
      });

  run.catch((err) => { console.error("Error:", err.message); process.exitCode = 1; });
}
