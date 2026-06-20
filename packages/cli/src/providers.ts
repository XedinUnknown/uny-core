/**
 * @uny/cli — providers
 * Build the base ordered provider map.
 */

import { coreProvider } from '@uny/core';
import type { Provider } from '@uny/di';

export interface AppConfig {
  name: string;
  version: string;
  rootDir: string;
}

/**
 * buildBaseProviders(appConfig: AppConfig): Map<string, Provider>
 *
 * Returns the ordered base map that every run starts from.
 * Order = composition order. Later providers override earlier ones for same keys.
 *
 * Phase 2:
 *   'core' → coreProvider with app config
 *
 * Future phases append here.
 */
export function buildBaseProviders(appConfig: AppConfig): Map<string, Provider> {
  return new Map([
    ['core', coreProvider(appConfig)],
  ]);
}
