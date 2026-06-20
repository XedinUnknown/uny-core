/**
 * Test helper: bootstrap function for tests.
 * Both CLI host and tests call this to compose the container.
 * Tests inject overrides as additional containers (first-match priority).
 */

import { Container, Provider, bootstrap, DelegatingContainer, composeProviders } from "@uny/di";

/**
 * Create a test container with optional overrides.
 * Composes all real production providers in order,
 * then prepends an override container that takes priority.
 */
export function createTestContainer(
  providers: Map<string, Provider>,
  overrides?: Provider
): Container {
  if (overrides) {
    // Overrides become an additional container that takes priority (first-match)
    const overrideProvider = composeProviders(
      new Map([["overrides", overrides]])
    );
    const overrideContainer = new DelegatingContainer(overrideProvider);
    return bootstrap(providers, [overrideContainer]);
  }
  return bootstrap(providers);
}
