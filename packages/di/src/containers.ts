/**
 * @uny/di — Container implementations
 */

import type { Container, KeyInspection, Provider } from "./types.js";
import { MissingKeyError } from "./errors.js";

// ── DelegatingContainer ────────────────────────────────────────────────

/**
 * Resolves keys from a composed provider.
 * Factories receive the parent container (if set) for lookup delegation.
 * Does NOT cache — caching is a separate concern (CachingContainer).
 * Does NOT detect circular deps — use CircularDetector decorator.
 */
export class DelegatingContainer implements Container {
  constructor(
    private provider: Provider,
    private parent?: Container
  ) {}

  private getBaseContainer(): Container {
    return this.parent ?? this;
  }

  resolve<T = any>(key: string): T {
    const def = this.provider.definitions?.[key];
    const ext = this.provider.extensions?.[key];

    if (!def && !ext) {
      const available = Object.keys(this.provider.definitions ?? {});
      throw new MissingKeyError(key, available);
    }

    const base = this.getBaseContainer();
    let value = def ? def(base) : undefined;

    if (ext) {
      value = ext(value, base);
    }

    return value as T;
  }

  has(key: string): boolean {
    return (
      key in (this.provider.definitions ?? {}) ||
      key in (this.provider.extensions ?? {})
    );
  }

  inspect(key: string): KeyInspection {
    return {
      key,
      definedBy: key in (this.provider.definitions ?? {}) ? "provider" : null,
      extendedBy: key in (this.provider.extensions ?? {}) ? ["provider"] : [],
      resolved: false,
    };
  }

  keys(): string[] {
    const defKeys = Object.keys(this.provider.definitions ?? {});
    const extKeys = Object.keys(this.provider.extensions ?? {});
    return [...new Set([...defKeys, ...extKeys])].sort();
  }
}

// ── CachingContainer ───────────────────────────────────────────────────

/**
 * Wraps a container and caches its resolve results.
 * Separate from resolution concern — can wrap any container.
 */
export class CachingContainer implements Container {
  private cache = new Map<string, any>();

  constructor(private inner: Container) {}

  resolve<T = any>(key: string): T {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const value = this.inner.resolve<T>(key);
    this.cache.set(key, value);
    return value;
  }

  has(key: string): boolean {
    return this.inner.has(key);
  }

  inspect(key: string): KeyInspection {
    const inner = this.inner.inspect?.(key) ?? {
      key,
      definedBy: null,
      extendedBy: [],
      resolved: false,
    };
    return {
      ...inner,
      resolved: this.cache.has(key),
      cached: this.cache.has(key),
    };
  }

  keys(): string[] {
    return this.inner.keys?.() ?? [];
  }
}

// ── ProxyContainer ─────────────────────────────────────────────────────

/**
 * Chicken-and-egg resolver. Accepts an inner container at construction
 * or via setInnerContainer(). Used to break circular lookup delegation
 * during bootstrap.
 */
export class ProxyContainer implements Container {
  private inner?: Container;

  constructor(inner?: Container) {
    this.inner = inner;
  }

  setInnerContainer(inner: Container): void {
    this.inner = inner;
  }

  resolve<T = any>(key: string): T {
    if (!this.inner) {
      throw new Error("ProxyContainer: inner container not set");
    }
    return this.inner.resolve<T>(key);
  }

  has(key: string): boolean {
    if (!this.inner) {
      throw new Error("ProxyContainer: inner container not set");
    }
    return this.inner.has(key);
  }

  inspect(key: string): KeyInspection {
    return this.inner?.inspect?.(key) ?? {
      key,
      definedBy: null,
      extendedBy: [],
      resolved: false,
    };
  }

  keys(): string[] {
    return this.inner?.keys?.() ?? [];
  }
}

// ── CompositeContainer ─────────────────────────────────────────────────

/**
 * Iterates a list of inner containers, returns the first match.
 * Falls through all containers and throws if nothing matched.
 */
export class CompositeContainer implements Container {
  constructor(private containers: Container[]) {}

  resolve<T = any>(key: string): T {
    for (const c of this.containers) {
      if (c.has(key)) {
        return c.resolve<T>(key);
      }
    }
    throw new MissingKeyError(key, []);
  }

  has(key: string): boolean {
    return this.containers.some((c) => c.has(key));
  }

  inspect(key: string): KeyInspection {
    for (const c of this.containers) {
      if (c.has(key)) {
        return c.inspect?.(key) ?? {
          key,
          definedBy: null,
          extendedBy: [],
          resolved: false,
        };
      }
    }
    return { key, definedBy: null, extendedBy: [], resolved: false };
  }

  keys(): string[] {
    const all = new Set<string>();
    for (const c of this.containers) {
      for (const k of c.keys?.() ?? []) {
        all.add(k);
      }
    }
    return [...all].sort();
  }
}
