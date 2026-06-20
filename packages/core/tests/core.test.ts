import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Provider } from "@uny/di";
import { coreProvider, AppConfig } from "../src/index.js";
import { createTestContainer } from "./test-helper";

describe("core module (@uny/core)", () => {
  it("overrides compose: derived values follow overridden rootDir", () => {
    const config: AppConfig = {
      name: "production-app",
      version: "3.0.0",
      rootDir: "/var/uny",
    };
    const providers = new Map<string, Provider>([["core", coreProvider(config)]]);
    const testOverrides: Provider = {
      definitions: {
        "app/rootDir": () => "/tmp/test-project",
      },
    };
    const c = createTestContainer(providers, testOverrides);

    assert.strictEqual(c.resolve("app/srcDir"), "/tmp/test-project/src");
    assert.strictEqual(c.resolve("app/version"), "3.0.0");
  });
});
