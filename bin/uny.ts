#!/usr/bin/env node

/**
 * uny — entrypoint
 *
 * The application host. Selects modules, composes them, bootstraps the container,
 * resolves the entrypoint, and invokes it. This is the only non-module code.
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
import { coreProvider } from '@uny/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Parse command-line flags (minimal hand-rolled parser for phase 2).
 */
interface Flags {
  projectDir: string;
  help: boolean;
}

function parseEntrypointFlags(argv: string[]): Flags {
  const flags: Flags = {
    projectDir: process.env.UNY_PROJECT_DIR ?? process.cwd(),
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--project-dir' || arg === '--help') {
      // Flags with values are handled by the app/entrypoint module
      // This entrypoint only extracts --project-dir and --help
      if (arg === '--help') {
        flags.help = true;
      }
    }
  }

  return flags;
}

/**
 * Load the user's uny.config.js transform (or return null).
 */
async function loadTransform(projectDir: string): Promise<((providers: Map<string, Provider>) => Map<string, Provider>) | null> {
  try {
    const configPath = `${projectDir}/uny.config.js`;
    const { default: transform } = await import(`file://${configPath}`);
    if (typeof transform === 'function') {
      return transform;
    } else if (transform && typeof transform === 'object' && 'definitions' in transform) {
      // Plain Provider object — wrap as append-transform
      return (providers) => {
        providers.set('user-config', transform);
        return providers;
      };
    }
  } catch (e) {
    // No config file or import failed — ignore
  }
  return null;
}

/**
 * Build the ordered base provider map (entrypoint's module selection).
 */
interface AppConfig {
  name: string;
  version: string;
  rootDir: string;
}

function buildBaseProviders(appConfig: AppConfig): Map<string, Provider> {
  return new Map([
    ['core', coreProvider(appConfig)],
    // Future: add @uny/cli module provider here
  ]);
}

/**
 * Main entrypoint: select modules → compose → bootstrap → entrypoint key → run.
 */
async function main(argv: string[]): Promise<void> {
  const flags = parseEntrypointFlags(argv);

  if (flags.help) {
    printUsage();
    return;
  }

  // Read package.json for app config
  const packagePath = `${__dirname}/../package.json`;
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

  // Select modules (entrypoint's concern)
  const baseMap = buildBaseProviders(appConfig);

  // Copy and apply user transform
  const workingMap = new Map(baseMap);
  const transform = await loadTransform(flags.projectDir);
  if (transform) {
    const transformed = transform(workingMap);
    if (transformed !== workingMap) {
      workingMap.clear();
      for (const [key, value] of transformed) {
        workingMap.set(key, value);
      }
    }
  }

  // Append CLI overrides (flags always win) — for now, empty
  // @uny/cli will add its own flag definitions once it's a module

  // Required-key guard
  if (!workingMap.has('core')) {
    throw new Error(
      "required provider 'core' is missing after uny.config.js transform. " +
      'Did your transform accidentally delete it?'
    );
  }

  const composed = composeProviders(workingMap);
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

  // Bootstrap container
  const container = bootstrap(workingMap);

  // Resolve and invoke entrypoint
  // For now (Phase 2), just print a usage message since @uny/cli module isn't integrated yet
  console.log('Entrypoint not yet implemented (waiting for @uny/cli module integration)');
  console.log('Run: node dist/bin/uny.js (from packages/cli) for Phase 2 inspect command');
}

function printUsage(): void {
  console.log(`
uny — exploration-first mobile app testing CLI

Usage:
  uny [command] [options]

Current status: Phase 2 (minimal CLI with inspect command via @uny/cli package)

Commands:
  inspect              List all keys and their sources (default)

Options:
  --project-dir <dir>  Project root where uny.config.js lives
                       (default: $UNY_PROJECT_DIR or cwd)
  --help               Show this help
  `);
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
