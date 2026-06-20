/**
 * @uny/di — Definition types
 *
 * Each helper returns a Definition that IS the factory function,
 * with getDependencies() attached for static analysis.
 * No separate class needed — the function itself is the definition.
 *
 * This mirrors PHP's __invoke() on callable classes:
 * the returned value is both the definition and the metadata source.
 */

import type { Definition, Container } from "./types.js";

// ── Type ───────────────────────────────────────────────────────────────

/**
 * A Definition that also declares its dependency keys.
 * The function IS the definition — no wrapping, no toDefinition().
 */
export interface DependencyAwareDefinition extends Definition {
  getDependencies(): string[];
}

// ── factory ────────────────────────────────────────────────────────────

/**
 * A definition that auto-resolves declared dependencies
 * and passes them to a callback function.
 *
 * ```ts
 * const resolve = factory(
 *   ['session/persistence', 'config/loaded'],
 *   (persistence, config) => createSessionManager({ persistence, config })
 * );
 * // resolve IS a Definition — use directly in provider.definitions
 * ```
 */
export function factory(
  deps: string[],
  fn: (...args: any[]) => any
): DependencyAwareDefinition {
  const def: DependencyAwareDefinition = (c: Container) => {
    const resolved = deps.map((key) => c.resolve(key));
    return fn(...resolved);
  };
  def.getDependencies = () => deps;
  return def;
}

// ── value ──────────────────────────────────────────────────────────────

/**
 * A definition that returns a fixed value.
 * Useful for constants, defaults, and host-injected config.
 */
export function value(v: any): DependencyAwareDefinition {
  const def: DependencyAwareDefinition = () => v;
  def.getDependencies = () => [];
  return def;
}

// ── alias ──────────────────────────────────────────────────────────────

/**
 * A definition whose value is looked up from another key.
 * Useful for binding, compatibility, and scoping.
 */
export function alias(from: string): DependencyAwareDefinition {
  const def: DependencyAwareDefinition = (c: Container) => c.resolve(from);
  def.getDependencies = () => [from];
  return def;
}

// ── construct ──────────────────────────────────────────────────────────

/**
 * A definition that instantiates a class with declared dependency keys.
 * Constructor receives resolved dependencies in order.
 *
 * ```ts
 * 'screen/tree-formatter': construct(TreeFormatter)
 * 'session/manager': construct(SessionManager, ['session/persistence', 'config/loaded'])
 * ```
 */
export function construct(
  cls: new (...args: any[]) => any,
  deps: string[] = []
): DependencyAwareDefinition {
  const def: DependencyAwareDefinition = (c: Container) => {
    const resolved = deps.map((key) => c.resolve(key));
    return new cls(...resolved);
  };
  def.getDependencies = () => deps;
  return def;
}
