/**
 * @uny/di — barrel
 */

export type {
  Definition,
  Extension,
  Provider,
  KeyProvenance,
  ComposedProvider,
  Container,
} from "./types.js";

export { composeProviders } from "./compose.js";

export {
  DelegatingContainer,
  CachingContainer,
  ProxyContainer,
  CompositeContainer,
} from "./containers.js";

export { CircularDetector } from "./circular.js";

export { bootstrap } from "./bootstrap.js";

export { DependencyError, MissingKeyError, CircularDependencyError } from "./errors.js";

export {
  factory,
  value,
  alias,
  construct,
} from "./definitions.js";

export type { DependencyAwareDefinition } from "./definitions.js";
