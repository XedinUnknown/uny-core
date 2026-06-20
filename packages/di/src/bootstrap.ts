/**
 * @uny/di — Bootstrap
 */

import type { Container, Provider } from "./types.js";
import { composeProviders } from "./compose.js";
import {
  DelegatingContainer,
  CachingContainer,
  ProxyContainer,
  CompositeContainer,
} from "./containers.js";
import { CircularDetector } from "./circular.js";

/**
 * Pure composition function. Takes an ordered map of providers and
 * returns a cached container with full delegation support.
 *
 * Both CLI host and tests call this with the same signature.
 *
 * Bootstrap wiring (matches Dhii pattern):
 *   providers → composeProviders
 *   → DelegatingContainer(composed, proxy)    — resolves from provider, delegates to proxy
 *   → CircularDetector(delegating)            — detects cycles (decorator)
 *   → CompositeContainer([extras, detected])  — external containers take priority
 *   → CachingContainer(composite)             — caches resolved values
 *   → proxy.setInnerContainer(caching)        — closes the loop
 */
export function bootstrap(
  providers: Map<string, Provider>,
  additionalContainers: Container[] = []
): Container {
  const composed = composeProviders(providers);
  const proxy = new ProxyContainer();
  const delegating = new DelegatingContainer(composed, proxy);
  const detected = new CircularDetector(delegating);
  const appContainer = new CachingContainer(
    new CompositeContainer([...additionalContainers, detected])
  );
  proxy.setInnerContainer(appContainer);
  return appContainer;
}
