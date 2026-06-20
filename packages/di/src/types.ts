/**
 * @uny/di — Core types
 */

export type Definition<T = any> = (container: Container) => T;

export type Extension<T = any> = (
  previous: T | undefined,
  container: Container,
) => T;

export interface Provider {
  definitions?: Record<string, Definition>;
  extensions?: Record<string, Extension>;
}

export interface KeyInspection {
  key: string;
  definedBy: string | null;
  extendedBy: string[];
  resolved: boolean;
  cached?: boolean;
}

export interface Container {
  resolve<T = any>(key: string): T;
  has(key: string): boolean;
  inspect?(key: string): KeyInspection;
  keys?(): string[];
}
