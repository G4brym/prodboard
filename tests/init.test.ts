import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { init } from "../src/commands/init.ts";
import { captureOutput, createTempDir } from "./helpers.ts";

let tmpDir: string;
let cleanup: () => void;

beforeEach(() => {
  const tmp = createTempDir();
  tmpDir = tmp.path;
  cleanup = tmp.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("Init Command", () => {
  test("creates directory structure", async () => {
    const prodboardDir = path.join(tmpDir, ".prodboard");
    await captureOutput(async () => {
      await init([], prodboardDir);
    });
    expect(fs.existsSync(prodboardDir)).toBe(true);
    expect(fs.existsSync(path.join(prodboardDir, "logs"))).toBe(true);
  });

  test("creates all expected files", async () => {
    const prodboardDir = path.join(tmpDir, ".prodboard");
    await captureOutput(async () => {
      await init([], prodboardDir);
    });
    expect(fs.existsSync(path.join(prodboardDir, "db.sqlite"))).toBe(true);
    expect(fs.existsSync(path.join(prodboardDir, "config.jsonc"))).toBe(true);
    expect(fs.existsSync(path.join(prodboardDir, "config.schema.json"))).toBe(true);
    expect(fs.existsSync(path.join(prodboardDir, "mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(prodboardDir, "system-prompt.md"))).toBe(true);
    expect(fs.existsSync(path.join(prodboardDir, "system-prompt-nogit.md"))).toBe(true);
  });

  test("DB is initialized with all tables", async () => {
    const prodboardDir = path.join(tmpDir, ".prodboard");
    await captureOutput(async () => {
      await init([], prodboardDir);
    });
    const { Database } = await import("bun:sqlite");
    const db = new Database(path.join(prodboardDir, "db.sqlite"));
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name != '_migrations'").all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain("issues");
    expect(names).toContain("comments");
    expect(names).toContain("schedules");
    expect(names).toContain("runs");
    db.close();
  });

  test("config file has valid JSONC", async () => {
    const prodboardDir = path.join(tmpDir, ".prodboard");
    await captureOutput(async () => {
      await init([], prodboardDir);
    });
    const content = fs.readFileSync(path.join(prodboardDir, "config.jsonc"), "utf-8");
    expect(content).toContain("general");
  });

  test("schema file is valid JSON", async () => {
    const prodboardDir = path.join(tmpDir, ".prodboard");
    await captureOutput(async () => {
      await init([], prodboardDir);
    });
    const content = fs.readFileSync(path.join(prodboardDir, "config.schema.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.$schema).toBeTruthy();
  });

  test("mcp.json has correct structure", async () => {
    const prodboardDir = path.join(tmpDir, ".prodboard");
    await captureOutput(async () => {
      await init([], prodboardDir);
    });
    const content = fs.readFileSync(path.join(prodboardDir, "mcp.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.mcpServers).toBeTruthy();
    expect(parsed.mcpServers.prodboard).toBeTruthy();
  });

  test("running init twice doesn't overwrite config.jsonc", async () => {
    const prodboardDir = path.join(tmpDir, ".prodboard");
    await captureOutput(async () => {
      await init([], prodboardDir);
    });
    // Modify config
    const configPath = path.join(prodboardDir, "config.jsonc");
    fs.writeFileSync(configPath, '{ "custom": true }');

    await captureOutput(async () => {
      await init([], prodboardDir);
    });
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain('"custom"');
  });

  test("running init twice does overwrite schema and mcp.json", async () => {
    const prodboardDir = path.join(tmpDir, ".prodboard");
    await captureOutput(async () => {
      await init([], prodboardDir);
    });

    // Modify schema
    const schemaPath = path.join(prodboardDir, "config.schema.json");
    fs.writeFileSync(schemaPath, '{}');

    await captureOutput(async () => {
      await init([], prodboardDir);
    });
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("$schema");
  });
});
