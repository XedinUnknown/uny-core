import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../.mcp.json', import.meta.url), 'utf8'));
const url = config.mcpServers.uny.url;
let session;
let id = 0;

async function rpc(method, params = {}, notification = false) {
  const requestId = notification ? undefined : ++id;
  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(session ? { 'Mcp-Session-Id': session } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
  });
  session = response.headers.get('mcp-session-id') ?? session;
  if (notification) {
    assert.ok(response.ok, `${method}: HTTP ${response.status}`);
    await response.body?.cancel();
    return;
  }
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`);
  const text = await response.text();
  const messages = response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split(/\r?\n\r?\n/).flatMap(event => {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      return data ? [JSON.parse(data)] : [];
    })
    : [JSON.parse(text)];
  const message = messages.find(item => item.id === requestId);
  assert.ok(message && !message.error, `${method}: ${JSON.stringify(message)}`);
  assert.ok(!message.result.isError, `${method}: ${JSON.stringify(message.result)}`);
  return message.result;
}

await rpc('initialize', {
  protocolVersion: '2024-11-05', capabilities: {},
  clientInfo: { name: 'uny-mcp-check', version: '1' },
});
await rpc('notifications/initialized', {}, true);

const { tools } = await rpc('tools/list');
assert.ok(tools.some(tool => tool.name === 'serena_read_memory'), 'Serena tools missing');
assert.ok(!tools.some(tool => /(^|_)activate_project$/.test(tool.name)), 'Project switching exposed');

// Sequential checks only: Datalayer 0.1.13 cannot safely overlap stdio calls.
for (const [memory_name, expected] of [['core', /uny/i], ['global/projects', /# Projects/]]) {
  const result = await rpc('tools/call', { name: 'serena_read_memory', arguments: { memory_name } });
  assert.match(JSON.stringify(result), expected, `Unexpected ${memory_name} memory response`);
}
const symbols = await rpc('tools/call', {
  name: 'serena_get_symbols_overview', arguments: { relative_path: 'packages/di/src/compose.ts' },
});
assert.match(JSON.stringify(symbols), /composeProviders/);
console.log(`PASS: ${tools.length} tools, project pinning, sequential memory reads, TypeScript analysis`);
console.log(`JetBrains tools: ${tools.filter(tool => tool.name.startsWith('jetbrains_')).length}`);
