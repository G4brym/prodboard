import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { stripJsoncComments, loadConfig, getDefaults, deepMerge } from "../src/config.ts";
import * as fs from "fs";
import * as path from "path";

describe("stripJsoncComments", () => {
  test("strips line comments", () => {
    const input = `{
  "key": "value" // this is a comment
}`;
    const result = stripJsoncComments(input);
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  test("strips block comments", () => {
    const input = `{
  /* this is a block comment */
  "key": "value"
}`;
    const result = stripJsoncComments(input);
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  test("does NOT strip comments inside strings", () => {
    const input = `{
  "key": "value // not a comment",
  "key2": "value /* also not a comment */"
}`;
    const result = stripJsoncComments(input);
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe("value // not a comment");
    expect(parsed.key2).toBe("value /* also not a comment */");
  });

  test("handles multi-line block comments", () => {
    const input = `{
  /*
   * multi-line
   * block comment
   */
  "key": "value"
}`;
    const result = stripJsoncComments(input);
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  test("handles multiple comments", () => {
    const input = `{
  // first comment
  "a": 1, // inline comment
  /* block */ "b": 2
}`;
    const result = stripJsoncComments(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });
});

describe("getDefaults", () => {
  test("returns correct default statuses", () => {
    const defaults = getDefaults();
    expect(defaults.general.statuses).toEqual(["todo", "in-progress", "review", "done", "archived"]);
  });

  test("returns correct default status", () => {
    const defaults = getDefaults();
    expect(defaults.general.defaultStatus).toBe("todo");
  });

  test("returns empty id prefix", () => {
    const defaults = getDefaults();
    expect(defaults.general.idPrefix).toBe("");
  });

  test("returns correct daemon defaults", () => {
    const defaults = getDefaults();
    expect(defaults.daemon.maxConcurrentRuns).toBe(2);
    expect(defaults.daemon.maxTurns).toBe(50);
    expect(defaults.daemon.hardMaxTurns).toBe(200);
    expect(defaults.daemon.runTimeoutSeconds).toBe(1800);
    expect(defaults.daemon.runRetentionDays).toBe(30);
    expect(defaults.daemon.logLevel).toBe("info");
    expect(defaults.daemon.useWorktrees).toBe("auto");
  });
});

describe("deepMerge", () => {
  test("user overrides win over defaults", () => {
    const defaults = { a: 1, b: { c: 2, d: 3 } };
    const user = { b: { c: 99 } };
    const result = deepMerge(defaults, user);
    expect(result).toEqual({ a: 1, b: { c: 99, d: 3 } });
  });

  test("arrays are replaced, not merged", () => {
    const defaults = { arr: [1, 2, 3] };
    const user = { arr: [4, 5] };
    const result = deepMerge(defaults, user);
    expect(result).toEqual({ arr: [4, 5] });
  });

  test("new keys from user are added", () => {
    const defaults = { a: 1 };
    const user = { b: 2 };
    const result = deepMerge(defaults, user);
    expect(result).toEqual({ a: 1, b: 2 });
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = `/tmp/prodboard-test-config-${Date.now()}`;
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns defaults when no config file exists", () => {
    const config = loadConfig(tmpDir);
    expect(config).toEqual(getDefaults());
  });

  test("merges partial config correctly", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.jsonc"),
      `{
        "general": {
          "defaultStatus": "in-progress"
        }
      }`
    );
    const config = loadConfig(tmpDir);
    expect(config.general.defaultStatus).toBe("in-progress");
    expect(config.general.statuses).toEqual(getDefaults().general.statuses);
    expect(config.daemon.maxTurns).toBe(50);
  });

  test("throws on invalid JSON", () => {
    fs.writeFileSync(path.join(tmpDir, "config.jsonc"), "{ invalid json }}}");
    expect(() => loadConfig(tmpDir)).toThrow("Invalid JSON");
  });

  test("handles JSONC with comments", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.jsonc"),
      `{
        // comment
        "general": {
          "defaultStatus": "review" /* inline */
        }
      }`
    );
    const config = loadConfig(tmpDir);
    expect(config.general.defaultStatus).toBe("review");
  });
});
