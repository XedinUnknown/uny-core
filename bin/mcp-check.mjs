import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../.mcp.json', import.meta.url), 'utf8'));
const url = config.mcpServers.serena.url;

function client() {
  let session;
  return async (id, method, params) => {
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(session ? { 'Mcp-Session-Id': session } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    session = response.headers.get('mcp-session-id') ?? session;
    assert.equal(response.status, 200);
    const message = await response.json();
    assert.equal(message.id, id);
    assert.ok(!message.error, JSON.stringify(message.error));
    assert.ok(!message.result.isError, JSON.stringify(message.result));
    return message.result;
  };
}

const clients = [client(), client()];
for (const rpc of clients) {
  await rpc(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'uny-mcp-check', version: '1' },
  });
}

const tools = await clients[0](2, 'tools/list', {});
assert.ok(!tools.tools.some(tool => tool.name === 'activate_project'));

// Client-local IDs can collide; the shared stdio gateway must route them independently.
const memories = await Promise.all(clients.map((rpc, index) => rpc(3, 'tools/call', {
  name: 'read_memory',
  arguments: { memory_name: index === 0 ? 'core' : 'global/projects' },
})));
assert.match(JSON.stringify(memories[0]), /Uny: Memory Root/);
assert.match(JSON.stringify(memories[1]), /uny/i);

const symbols = await clients[0](4, 'tools/call', {
  name: 'get_symbols_overview',
  arguments: { relative_path: 'packages/di/src/compose.ts' },
});
assert.match(JSON.stringify(symbols), /composeProviders/);
console.log('PASS: concurrent clients, colliding IDs, project pinning, project/global memories, TypeScript analysis.');
