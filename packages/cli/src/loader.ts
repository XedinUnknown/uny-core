/**
 * @uny/cli — loader
 * Loads and validates user uny.config.js transform.
 */

import { pathToFileURL } from 'node:url';
import { access } from 'node:fs/promises';
import path from 'node:path';
import type { Provider } from '@uny/di';

export type Transform = (providers: Map<string, Provider>) => Map<string, Provider>;

type UserModule = Transform | Provider;

/**
 * loadTransform(projectDir: string): Promise<Transform | null>
 *
 * Looks for uny.config.js or uny.config.mjs in projectDir.
 * Returns a transform function, or null if no config file found.
 *
 * Accepted exports:
 *   - Function (providers) => providers  → used directly
 *   - Plain Provider object              → wrapped into append-transform
 *
 * Throws if export is neither of the above.
 */
export async function loadTransform(projectDir: string): Promise<Transform | null> {
  // Try uny.config.js first, then uny.config.mjs
  for (const filename of ['uny.config.js', 'uny.config.mjs']) {
    const filePath = path.join(projectDir, filename);
    if (await fileExists(filePath)) {
      return await loadAndValidate(filePath);
    }
  }
  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadAndValidate(filePath: string): Promise<Transform> {
  const fileUrl = pathToFileURL(filePath).href;
  let mod: any;
  try {
    mod = await import(fileUrl);
  } catch (e: any) {
    throw new Error(`Failed to import ${filePath}: ${e.message}`);
  }

  const exp: UserModule | undefined = mod.default ?? mod.provider;
  if (!exp) {
    throw new Error(`${filePath} must export default a Provider or a transform function`);
  }

  // Shape A: function
  if (typeof exp === 'function') {
    return exp as Transform;
  }

  // Shape B: plain Provider object — wrap it
  if (isProvider(exp)) {
    return (providers) => {
      const copy = new Map(providers);
      copy.set('user', exp as Provider);
      return copy;
    };
  }

  throw new Error(
    `${filePath} default export must be a Provider or a (providers) => providers function, got ${typeof exp}`
  );
}

function isProvider(obj: any): obj is Provider {
  return (
    obj &&
    typeof obj === 'object' &&
    (('definitions' in obj && typeof obj.definitions === 'object') ||
      ('extensions' in obj && typeof obj.extensions === 'object'))
  );
}
