import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { OpenCodeServerManager } from "../src/opencode-server.ts";
import { createTestConfig } from "./helpers.ts";

describe("OpenCodeServerManager", () => {
  test("uses configured serverUrl", () => {
    const config = createTestConfig({
      daemon: {
        ...createTestConfig().daemon,
        agent: "opencode",
        opencode: { serverUrl: "http://custom:9999", model: null, agent: null },
      },
    });
    const manager = new OpenCodeServerManager(config);
    expect(manager.url).toBe("http://custom:9999");
  });

  test("uses default port 4096", () => {
    const config = createTestConfig({
      daemon: {
        ...createTestConfig().daemon,
        agent: "opencode",
        opencode: { serverUrl: null, model: null, agent: null },
      },
    });
    const manager = new OpenCodeServerManager(config);
    expect(manager.url).toBe("http://localhost:4096");
  });

  test("isRunning returns false when fetch fails", async () => {
    const config = createTestConfig({
      daemon: {
        ...createTestConfig().daemon,
        agent: "opencode",
        opencode: { serverUrl: "http://localhost:19999", model: null, agent: null },
      },
    });
    const manager = new OpenCodeServerManager(config);
    const result = await manager.isRunning();
    expect(result).toBe(false);
  });

  test("stop does not throw when no server was started", async () => {
    const config = createTestConfig();
    const manager = new OpenCodeServerManager(config);
    // Should not throw
    await manager.stop();
  });
});
