/**
 * @uny/di — Provider composition
 */

import type { Definition, Extension, Provider } from "./types.js";

/**
 * Compose an ordered map of providers into a single provider.
 * Later definitions override earlier ones.
 * Extensions compose in order (each receives the previous value).
 */
export function composeProviders(
  providers: Map<string, Provider>
): Provider {
  const composedDefs: Record<string, Definition> = {};
  const composedExts: Record<string, Extension> = {};

  for (const [, provider] of providers) {
    if (provider.definitions) {
      Object.assign(composedDefs, provider.definitions);
    }
    if (provider.extensions) {
      for (const [key, ext] of Object.entries(provider.extensions)) {
        if (composedExts[key]) {
          const prev = composedExts[key];
          composedExts[key] = (previous, container) => {
            const result = prev(previous, container);
            return ext(result, container);
          };
        } else {
          composedExts[key] = ext;
        }
      }
    }
  }

  return {
    definitions: composedDefs,
    extensions: composedExts,
  };
}
