import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTransform } from '../src/loader.js';
import type { Provider } from '@uny/di';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('loadTransform', () => {
  it('returns null when no uny.config.js present', async () => {
    const transform = await loadTransform(join(fixturesDir, 'no-config'));
    assert.strictEqual(transform, null);
  });

  it('loads function export and returns it', async () => {
    const transform = await loadTransform(join(fixturesDir, 'has-transform'));
    assert.ok(typeof transform === 'function');
    
    const base = new Map<string, Provider>([
      ['core', { definitions: { 'app/name': () => 'test' } }],
    ]);
    const result = transform(base);
    assert.ok(result.has('test-transform'));
    assert.strictEqual(result.get('test-transform')?.definitions?.['test/key']?.(), 'test-value');
  });

  it('wraps plain Provider export into append-transform', async () => {
    const transform = await loadTransform(join(fixturesDir, 'plain-provider'));
    assert.ok(typeof transform === 'function');

    const base = new Map<string, Provider>([
      ['core', { definitions: { 'app/name': () => 'test' } }],
    ]);
    const result = transform(base);
    assert.ok(result.has('user'));
    assert.strictEqual(result.get('user')?.definitions?.['test/plain']?.(), 'plain-provider-value');
  });

  it('throws clearly when export shape is invalid', async () => {
    try {
      await loadTransform(join(fixturesDir, 'bad-export'));
      assert.fail('should have thrown');
    } catch (e: any) {
      assert.match(e.message, /must export.*Provider|function/i);
    }
  });

  it('transform returns a map with additions', async () => {
    const transform = await loadTransform(join(fixturesDir, 'has-transform'));
    assert.ok(transform);

    const base = new Map<string, Provider>([
      ['core', { definitions: { 'app/name': () => 'test' } }],
    ]);
    const result = transform(base);
    
    // Transform adds a key to the returned map
    assert.ok(result.has('test-transform'));
    assert.strictEqual(result.get('test-transform')?.definitions?.['test/key']?.(), 'test-value');
  });

  it('transform can insert a provider at a specific position', async () => {
    const transform = await loadTransform(join(fixturesDir, 'positioning'));
    assert.ok(transform);

    const base = new Map<string, Provider>([
      ['core', { definitions: { 'app/name': () => 'test' } }],
      ['other', { definitions: { 'other/key': () => 'other' } }],
    ]);
    const result = transform(base);

    const keys = [...result.keys()];
    const coreIndex = keys.indexOf('core');
    const positionedIndex = keys.indexOf('positioned');
    const otherIndex = keys.indexOf('other');

    assert.ok(coreIndex !== -1);
    assert.ok(positionedIndex !== -1);
    assert.ok(otherIndex !== -1);
    assert.ok(positionedIndex === coreIndex + 1, 'positioned should be right after core');
    assert.ok(otherIndex > positionedIndex, 'other should be after positioned');
  });

  it('transform return value is used', async () => {
    const transform = await loadTransform(join(fixturesDir, 'has-transform'));
    assert.ok(transform);

    const base = new Map<string, Provider>([
      ['core', { definitions: { 'app/name': () => 'test' } }],
    ]);
    const result = transform(base);
    
    // Verify the returned map has the transform's additions
    assert.ok(result.has('test-transform'));
  });
});
