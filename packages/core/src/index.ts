/**
 * @uny/core — core app module
 *
 * Provides basic services: root path, app name, version, environment.
 */

import { Provider } from "@uny/di";

export interface AppConfig {
  name: string;
  version: string;
  rootDir: string;
}

/**
 * Core provider: defines basic app configuration and paths.
 * All other modules depend on these keys.
 */
export function coreProvider(config: AppConfig): Provider {
  return {
    definitions: {
      // Basic app info — from config
      "app/name": () => config.name,
      "app/version": () => config.version,
      "app/rootDir": () => config.rootDir,

      // Derived paths
      "app/srcDir": (c) => `${c.resolve("app/rootDir")}/src`,
      "app/libDir": (c) => `${c.resolve("app/rootDir")}/lib`,
      "app/workDir": (c) => `${c.resolve("app/rootDir")}/work`,

      // Environment
      "app/environment": () => process.env.NODE_ENV ?? "development",
      "app/isDebug": (c) => c.resolve("app/environment") === "development",
    },
  };
}
