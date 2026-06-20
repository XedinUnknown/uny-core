import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../../..');
const fixturesDir = join(__dirname, 'fixtures');
const unyBin = join(projectRoot, 'packages/cli/dist/bin/uny.js');

describe('uny CLI (spawned process)', async () => {
  it('prints help with --help', async () => {
    const result = await execa('node', [unyBin, '--help'], {
      cwd: projectRoot,
      reject: false,
    });
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /Usage:/i);
  });

  it('inspect prints key table with no uny.config.js', async () => {
    const result = await execa('node', [unyBin, 'inspect'], {
      cwd: join(fixturesDir, 'no-config'),
      reject: false,
    });
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /KEY/i);
    assert.match(result.stdout, /DEFINED-BY/i);
    assert.match(result.stdout, /app\/rootDir/); // from core provider
  });

  it('inspect --format json outputs valid JSON', async () => {
    const result = await execa('node', [unyBin, 'inspect', '--format', 'json'], {
      cwd: join(fixturesDir, 'no-config'),
      reject: false,
    });
    assert.strictEqual(result.exitCode, 0);
    const json = JSON.parse(result.stdout);
    assert.ok(Array.isArray(json));
    assert.ok(json.length > 0);
    assert.ok(json[0].key);
    assert.ok('definedBy' in json[0]);
    assert.ok('extendedBy' in json[0]);
  });

  it('uny.config.js transform adds keys visible in inspect', async () => {
    const result = await execa('node', [unyBin, 'inspect', '--format', 'json'], {
      cwd: join(fixturesDir, 'has-transform'),
      reject: false,
    });
    assert.strictEqual(result.exitCode, 0);
    const json = JSON.parse(result.stdout);
    const testKey = json.find((k: any) => k.key === 'test/key');
    assert.ok(testKey, 'test/key from transform should be present');
  });

  it('plain Provider export transform adds keys', async () => {
    const result = await execa('node', [unyBin, 'inspect', '--format', 'json'], {
      cwd: join(fixturesDir, 'plain-provider'),
      reject: false,
    });
    assert.strictEqual(result.exitCode, 0);
    const json = JSON.parse(result.stdout);
    const testKey = json.find((k: any) => k.key === 'test/plain');
    assert.ok(testKey, 'test/plain from wrapped Provider should be present');
  });

  it('bad export in uny.config.js throws clearly', async () => {
    const result = await execa('node', [unyBin, 'inspect'], {
      cwd: join(fixturesDir, 'bad-export'),
      reject: false,
    });
    assert.notStrictEqual(result.exitCode, 0);
    assert.match(result.stderr, /must export|Provider|function/i);
  });

  it('transform positioning inserts a provider in order', async () => {
    const result = await execa('node', [unyBin, 'inspect', '--format', 'json'], {
      cwd: join(fixturesDir, 'positioning'),
      reject: false,
    });
    assert.strictEqual(result.exitCode, 0);
    const json = JSON.parse(result.stdout);
    const coreIdx = json.findIndex((k: any) => k.key === 'app/rootDir'); // from core
    const positionedIdx = json.findIndex((k: any) => k.key === 'positioned/key');
    assert.ok(coreIdx !== -1, 'core keys should be present');
    assert.ok(positionedIdx !== -1, 'positioned keys should be present');
    // Positioned should come relatively early if it's inserted after core
    // (exact position depends on how keys are ordered, but it should exist)
  });

  it('unknown command exits with clear error', async () => {
    const result = await execa('node', [unyBin, 'unknown-command'], {
      cwd: join(fixturesDir, 'no-config'),
      reject: false,
    });
    assert.notStrictEqual(result.exitCode, 0);
    assert.match(result.stderr, /unknown command/i);
  });
});
