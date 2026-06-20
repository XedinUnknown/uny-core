# Implementation Findings

Concrete observations from reading two real PHP implementations:

- **Simple**: `wp-oop/plugin-boilerplate` (0.3.x branch) — starter template.
- **Complex**: `xedinunknown/justwatch` (private) — production WordPress plugin with 12 modules.

Both share the same bootstrap infrastructure; `justwatch` is `plugin-boilerplate` grown to production scale.

---

## Repository Layout

### plugin-boilerplate

```
plugin.php              # WP entry point — host bootstrap
module.php              # factory: given rootDir+mainFile, returns a ModularModule
src/
  modules.php           # returns ordered list of ModuleInterface instances
  bootstrap.php         # pure composition function: providers[] + extra containers => ContainerInterface
  factories.php         # main module keyed definitions
  extensions.php        # main module extensions
  MainModule.php        # setup(): builds ServiceProvider from factories.php + extensions.php; run(): empty
  ModularModule.php     # aggregates sub-modules: setup() = CompositeCachingServiceProvider; run() = walk
  Module.php            # base module class
modules/
  demo/
    src/
      DemoModule.php
      factories.php
      extensions.php
    tests/phpunit/Func/
      DemoModuleTest.php
tests/phpunit/
  AbstractTestCase.php
  AbstractModularTestCase.php   # bootstrapProviders(), bootstrapModules()
  AbstractApplicationTestCase.php  # bootstrapApplication()
  Func/
    AppModuleTest.php
    MainModuleTest.php
    ModularModuleTest.php
```

### justwatch (additional scale)

```
src/
  factories.php                         # merges: settings + cache + http + filesystem + core + integration + override
  factories.settings.php                # settings field definitions (ServiceList pattern)
  factories.cache.php
  factories.http.php
  factories.filesystem.php
  factories.integration.php             # merges all per-module integration files
  factories.integration.filesystem.php  # binds filesystem module keys to app keys
  factories.integration.i18n.php
  factories.integration.settings.php
  factories.integration.shortcode.php
  factories.integration.templating.php
  factories.integration.classical-editor.php
  factories.integration.geoip.php
  factories.integration.partner-sdk.php
  factories.override.php                # final overrides (currently empty — slot reserved)
  extensions.php                        # aggregates extension files
  extensions.settings.php               # extends partner-settings form with app-level fields
modules/
  i18n/ env/ partner-sdk/ partner-api/ filesystem/ templating/
  shortcode/ settings/ customizer/ classical-editor/ geoip/ debug/
    src/
      XxxModule.php
      factories.php
      factories.integration.php  (some modules)
      factories.settings.php     (some modules)
      factories.blocks.php       (some modules)
      extensions.php
    tests/phpunit/
      Func/XxxTest.php
      TestCase.php
      ModulePathTrait.php
```

---

## Key Structural Observations

### 1. Module = `ModuleInterface` with `setup()` and `run()`

Every module implements `Dhii\Modular\Module\ModuleInterface`:

```php
interface ModuleInterface {
    public function setup(): ServiceProviderInterface;
    public function run(ContainerInterface $c): void;
}
```

- `setup()` returns the module's service provider (factories + extensions).
- `run()` receives the fully composed container and registers WP hooks.
- **The composition is complete before any module runs.** `run()` is the only place side effects happen.

### 2. Bootstrap sequence (bootstrap.php)

```
providers[]
  → CompositeCachingServiceProvider      # merges all factories/extensions, caches composition
  → DelegatingContainer(provider, proxy) # resolves services; proxy not yet set
  → CachingContainer(
       CompositeContainer([
         ...additionalContainers,         # host-provided: wp/core/* keys injected here
         delegatingContainer
       ])
    )
  → proxy.setInnerContainer(appContainer) # chicken-and-egg resolved here
```

The proxy pattern allows definitions to reference the final composed container during lazy resolution, even though the container didn't exist when definitions were declared.

### 3. Factories file splitting (justwatch pattern)

The main `factories.php` does not define all services inline. It delegates by merging return values of many sub-files:

```php
return function (): array {
    return array_merge(
        (require "$dir/factories.settings.php")(),
        (require "$dir/factories.cache.php")(),
        (require "$dir/factories.http.php")(),
        (require "$dir/factories.filesystem.php")(),
        [ /* inline core definitions */ ],
        (require "$dir/factories.integration.php")(),
        (require "$dir/factories.override.php")(),
    );
};
```

File naming conventions:
- `factories.php` — primary definitions for this module's own domain
- `factories.<topic>.php` — sub-topic definitions (e.g., cache, http, filesystem, settings)
- `factories.integration.<module>.php` — bindings from app keys to a specific module's expected keys
- `factories.integration.php` — aggregates all integration files
- `factories.override.php` — reserved final-override slot (can be empty)
- `extensions.php` — aggregates extension files
- `extensions.<topic>.php` — extensions for a specific concern

### 4. Integration files are bindings, not logic

`factories.integration.settings.php` (app layer wiring the settings module):

```php
'justwatch/partner-settings/settings/api_key' => new Value(''),
'justwatch/partner-settings/template_factory' =>
    new Alias('justwatch/plugin/templating/path_template_factory'),
'justwatch/partner-settings/options' => new Alias('justwatch/plugin/options'),
'justwatch/partner-settings/is_debug' => new Alias('justwatch/plugin/is_debug'),
```

Each integration file binds `<module-namespace>/expected_key` → `<app-namespace>/provided_key`. These are all aliases or value overrides. No logic — pure key mapping.

### 5. Override file is a reserved composition slot

`factories.override.php` exists but is often empty:

```php
return function () {
    return array_merge([ ]);
};
```

Its presence signals intent: **this is where final policy overrides go**. The architecture treats it as a named seam, not just dead code.

### 6. Debug module is an ordinary module

`DebugModule` is in the standard module list and uses the same extension primitives:

```php
// extensions.php of debug module
'justwatch/partner-settings/forms/settings/fieldset/main' => new Extension([
    'justwatch/partner-debug/settings/fields',
], function (Fieldset $fieldset, array $newFields): Fieldset {
    array_walk($newFields, fn ($field) => $fieldset->addField($field));
    return $fieldset;
}),
'justwatch/partner-settings/forms/settings/keys' => new Extension([
    'justwatch/partner-debug/settings/keys',
], fn (array $prev, array $new): array => array_merge($prev, $new)),
```

And its own integration settings file rebinds the API base URL from the debug module's key to the settings module's expected key:

```php
// debug/factories.integration.settings.php
'justwatch/partner-settings/settings/api_base_url' =>
    new Alias('justwatch/partner-debug/settings/api_base_url'),
```

No special access to internals. No debug-only bootstrap path. Loaded last in the module list so its extensions layer on top.

### 7. ServiceList pattern for collections

The settings module defines a `ServiceList` of fields, then extensions append to it:

```php
// factories.settings.php
'justwatch/plugin/settings/fields' => new ServiceList([
    'justwatch/plugin/settings/field/api_key',
]),
```

The main app then extends the settings form fieldset with those fields via `extensions.settings.php`. The debug module uses the same extension key to add its own debug field. The consumer (`RenderSettingsPage`) reads the final resolved fieldset — it never knows how many modules contributed.

### 8. Key naming convention

Keys follow a path-like `<vendor>/<module>/<sub-topic>/<name>` pattern:

```
justwatch/plugin/is_debug
justwatch/plugin/filesystem/path_resolver
justwatch/partner-settings/forms/settings/fieldset/main
justwatch/partner-debug/settings/api_base_url
wp/core/options
wp/core/locale
wordpress/plugin_factory
package/version_factory
```

- `wp/core/*` — host-provided WP platform values (injected via `Dictionary` in `plugin.php`)
- `wordpress/*` — WP-specific abstractions (plugin factory, etc.)
- `justwatch/plugin/*` — app-level definitions
- `justwatch/<module>/*` — module-local definitions
- `package/*` — framework-neutral primitives (version factory)

### 9. ModularModule — composite submodule aggregation

`ModularModule` wraps a list of modules into a single module. Used in `module.php` (the external-facing factory) to expose the whole plugin as one `ModuleInterface` to a parent application. Its `setup()` collects sub-providers into a `CompositeCachingServiceProvider`; its `run()` walks all sub-modules.

This is submodule composition: the external API sees one module; internally it's 12.

### 10. MutableDeprefixingContainer — scoped read/write settings

`justwatch/partner-settings/settings_container` resolves to a `MutableDeprefixingContainer`:

```php
new MutableDeprefixingContainer($c, $optionsContainer, 'justwatch/partner-settings/settings/')
```

Reads from the full composed container (which checks persisted options via `wp/core/options` first, then falls back to code defaults). Writes to the persisted options container. The prefix `justwatch/partner-settings/settings/` is stripped on reads/writes, so the settings module uses short local keys like `api_key` while the actual stored key is `justwatch/partner-settings/settings/api_key`.

This is the scoped configuration pattern: one source of truth, but accessed through a namespaced view.

---

## Test Architecture

### Core idea

Tests compose a real application container — using the **same providers as production** — and inject
test-only overrides by appending a final `ServiceProvider`. Because later providers win for factory
conflicts, any key can be replaced with a mock or stub without touching module code. This means:

- The composition semantics (order, extensions, aliases) are tested against real production providers.
- Platform dependencies (`wp/core/*`, `wpdb`, etc.) are satisfied by lightweight anonymous factories.
- No mocking framework needed to substitute a service — just supply a later factory for that key.

### Harness layers

```
AbstractTestCase                  # PHPUnit base
  AbstractModularTestCase         # bootstrapProviders(), bootstrapModules()
    AbstractApplicationTestCase   # bootstrapApplication() — loads real module list + MainModule
```

**`AbstractModularTestCase::bootstrapModules()`**:

```php
protected function bootstrapModules(
    iterable $modules = [],
    array $factories = [],   // override/mock factories — appended as the final provider
    array $extensions = []   // extra extensions — appended as the final provider
): ContainerInterface {
    $extraProvider = new ServiceProvider($factories, $extensions);
    $providers = array_map(fn($m) => $m->setup(), $modules);
    $allProviders = array_merge($providers, [$extraProvider]); // extra is LAST → wins
    $container = $this->bootstrapProviders($allProviders);
    array_walk($modules, fn($m) => $m->run($container));
    return $container;
}
```

The override provider is always appended last. This is the same override mechanic used in
production (debug module, host overrides) — tests are not a special case.

**`AbstractApplicationTestCase::bootstrapApplication()`**:

```php
protected function bootstrapApplication(array $factories = [], array $extensions = []): ContainerInterface {
    $mainModule = new MainModule($basePath, $baseDir);
    $appModules = array_merge(
        (require "$baseDir/src/modules.php")($basePath, $baseDir),
        [$mainModule]
    );
    return $this->bootstrapModules($appModules, $factories, $extensions);
}
```

This loads the **real production module list** — all 12 modules — then passes test factories as
overrides. The test gets a fully composed container identical to production except for the keys it
explicitly replaces.

### Module-isolation pattern

Each module's own `TestCase.php` bootstraps only that module with its outside dependencies
supplied as anonymous factories:

```php
$container = $this->bootstrapModules([new DebugModule()], [
    // satisfy keys the debug module depends on but doesn't provide
    'justwatch/partner-settings/forms/settings/fieldset/main' => fn(): Fieldset => new Fieldset([]),
    'justwatch/partner-settings/forms/settings/keys' => fn(): array => [],
]);
// assert the debug module's extensions had effect
$fieldset = $container->get('justwatch/partner-settings/forms/settings/fieldset/main');
```

The module under test contributes its real factories and extensions. Tests assert composition
outcomes (was the extension applied? did the field appear?), not internal implementation.

### Application-level test

`AppModuleTest::testInitializationAndExtension()` boots the full production module list, injects
platform keys as mock factories, and then asserts that a synthetic factory+extension pair composed
correctly end-to-end — verifying the bootstrap plumbing without a real WordPress runtime:

```php
$container = $this->bootstrapApplication(
    [
        'wp/core/is_debug'    => fn(): bool => true,
        'wp/core/options'     => fn() => $this->createMutableContainer($options),
        'wp/core/wpdb'        => fn() => $this->createWpdb(),
        // ... other wp/core/* keys
        $serviceName          => fn(): string => $factoryValue,  // custom test service
    ],
    [
        $serviceName => fn(ContainerInterface $c, string $prev) use ($extensionValue): string =>
            "{$prev}/{$extensionValue}",  // custom test extension
    ]
);
$this->assertEquals("{$factoryValue}/{$extensionValue}", $container->get($serviceName));
```

### Summary: why this pattern matters

| Concern | How it's handled |
|---|---|
| Real composition semantics tested | Production providers loaded, not re-implemented in tests |
| Platform isolation | `wp/core/*` keys overridden with lightweight fakes |
| Module isolation | Only the module under test loaded; deps supplied as inline factories |
| Override mechanism | Identical to production (later provider wins) — no test-specific magic |
| Extension verification | Assert resolved values, not internal wiring |

---

## Portable Lessons for uny

1. **Configuration file splitting** by `factories.<topic>.php` / `factories.integration.<module>.php` / `factories.override.php` is a practical governance pattern at scale, not a core primitive. Use it when a single file becomes unwieldy.

2. **Integration files are pure binding layers** — only `Alias` and `Value`, no logic. They are the explicit seam between module-local keys and app-level keys.

3. **Override file as a named seam** — even if empty, declaring an override slot signals where final policy belongs. Reserve it.

4. **Debug module loads last in the module list** so its extensions win ordering. Explicit ordering, explicit intent.

5. **`run()` is the only place side effects happen.** All composition completes before any `run()` is called. This separation is load-order safe.

6. **Test harness appends override factories as a final provider**, not by modifying module code. Same mechanism the debug module uses in production.

7. **`ModularModule`** is the composite pattern for exposing a set of modules as a single `ModuleInterface` — useful when one package needs to present itself as one module to a host.

8. **Scoped settings container** (`MutableDeprefixingContainer`) is the read/write equivalent of a scoped view: reads from composed truth (code → persisted), writes to persisted layer, prefix stripped in both directions.
