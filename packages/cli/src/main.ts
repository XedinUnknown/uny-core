/**
 * @uny/cli — main
 * Entry point: composition, bootstrap, dispatch.
 */

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrap,
  composeProviders,
  DelegatingContainer,
  MissingKeyError,
  type Provider,
} from '@uny/di';
import { parseFlags, type Flags } from './flags.js';
import { buildBaseProviders, type AppConfig } from './providers.js';
import { loadTransform } from './loader.js';
import { inspectCommand } from './commands/inspect.js';

/**
 * main(argv: string[]): Promise<void>
 *
 * 1. Parse flags
 * 2. Load base provider map
 * 3. Load and apply user transform from uny.config.js
 * 4. Append cli-overrides (flags always win)
 * 5. Required-key guard
 * 6. Bootstrap container
 * 7. Dispatch command
 */
export async function main(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);

  if (flags.help) {
    printUsage();
    return;
  }

  // Read package.json for app config
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const packagePath = `${__dirname}/../../package.json`;
  let appConfig: AppConfig;
  try {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    appConfig = {
      name: pkg.name,
      version: pkg.version,
      rootDir: flags.projectDir,
    };
  } catch {
    appConfig = {
      name: 'uny',
      version: '0.0.0',
      rootDir: flags.projectDir,
    };
  }

  // Build base provider map
  const baseMap = buildBaseProviders(appConfig);

  // Copy base map so transform mutates a fresh copy
  const workingMap = new Map(baseMap);

  // Load and apply user transform
  const transform = await loadTransform(flags.projectDir);
  if (transform) {
    // Transform receives the working map and returns a (possibly modified) map.
    // Use the returned map directly.
    const transformed = transform(workingMap);
    if (transformed !== workingMap) {
      // If transform returned a new map, use it
      workingMap.clear();
      for (const [key, value] of transformed) {
        workingMap.set(key, value);
      }
    }
    // If transform returned the same map, it mutated in place, so workingMap is already updated
  }

  // Append cli-overrides LAST so flags always win
  workingMap.set('cli-overrides', {
    definitions: {
      'io/verbosity': () => flags.verbose - flags.quiet,
      'output/format': () => flags.format,
    },
  });

  // Required-key guard: check that core still exists
  requiredKeyGuard(workingMap);

  // Bootstrap container
  const container = bootstrap(workingMap);

  // Dispatch command
  await dispatchCommand(flags.command, container, flags);
}

function requiredKeyGuard(map: Map<string, Provider>): void {
  // Check that 'core' provider is still present
  if (!map.has('core')) {
    throw new Error(
      "required provider 'core' is missing after uny.config.js transform. " +
      'Did your transform accidentally delete it?'
    );
  }

  // Try to resolve a key from core to verify it works
  const composed = composeProviders(map);
  const delegating = new DelegatingContainer(composed);
  try {
    delegating.resolve('app/rootDir');
  } catch (e: any) {
    if (e instanceof MissingKeyError) {
      throw new Error(
        "required key 'app/rootDir' is missing after uny.config.js transform. " +
        'Did your transform accidentally delete the core provider?'
      );
    }
    throw e;
  }
}

async function dispatchCommand(
  commandName: string,
  container: any,
  flags: Flags
): Promise<void> {
  switch (commandName) {
    case 'inspect':
      inspectCommand(container, flags);
      return;
    default:
      throw new Error(`unknown command: ${commandName}`);
  }
}

function printUsage(): void {
  console.log(`
uny — exploration-first mobile app testing CLI

Usage:
  uny [command] [options]

Commands:
  inspect              List all keys and their sources (default)

Options:
  --project-dir <dir>  Project root where uny.config.js lives
                       (default: $UNY_PROJECT_DIR or cwd)
  --format human|json  Output format (default: human)
  -v                   Increment verbosity (repeatable)
  -q                   Decrement quiet (repeatable)
  --help               Show this help

Examples:
  uny inspect
  uny inspect --format json
  uny --project-dir /path/to/project inspect
  `);
}
