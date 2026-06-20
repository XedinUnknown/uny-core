/**
 * @uny/di — Circular dependency detector
 */

import type { Container, KeyInspection } from "./types.js";
import { CircularDependencyError } from "./errors.js";

/**
 * Decorator that detects circular dependencies during resolution.
 * Wraps any container — does NOT need to be the DelegatingContainer.
 */
export class CircularDetector implements Container {
  private resolving = new Set<string>();

  constructor(private inner: Container) {}

  resolve<T = any>(key: string): T {
    if (this.resolving.has(key)) {
      throw new CircularDependencyError(key, [...this.resolving]);
    }

    this.resolving.add(key);
    try {
      return this.inner.resolve<T>(key);
    } finally {
      this.resolving.delete(key);
    }
  }

  has(key: string): boolean {
    return this.inner.has(key);
  }

  inspect(key: string): KeyInspection {
    return this.inner.inspect?.(key) ?? {
      key,
      definedBy: null,
      extendedBy: [],
      resolved: false,
    };
  }

  keys(): string[] {
    return this.inner.keys?.() ?? [];
  }
}
