import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../src/logger.ts";
import { createTempDir } from "./helpers.ts";

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

describe("Logger", () => {
  test("writes log entries in correct format", () => {
    const logDir = path.join(tmpDir, "logs");
    const logger = new Logger({ logDir, level: "debug", maxSizeMb: 10, maxFiles: 5 });
    logger.info("Test message");

    const content = fs.readFileSync(path.join(logDir, "daemon.log"), "utf-8");
    expect(content).toContain("[INFO]");
    expect(content).toContain("Test message");
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });

  test("respects log level (debug filtered when level=info)", () => {
    const logDir = path.join(tmpDir, "logs");
    const logger = new Logger({ logDir, level: "info", maxSizeMb: 10, maxFiles: 5 });
    logger.debug("Should not appear");
    logger.info("Should appear");

    const content = fs.readFileSync(path.join(logDir, "daemon.log"), "utf-8");
    expect(content).not.toContain("Should not appear");
    expect(content).toContain("Should appear");
  });

  test("structured data included as JSON", () => {
    const logDir = path.join(tmpDir, "logs");
    const logger = new Logger({ logDir, level: "debug", maxSizeMb: 10, maxFiles: 5 });
    logger.info("Test", { key: "value", num: 42 });

    const content = fs.readFileSync(path.join(logDir, "daemon.log"), "utf-8");
    expect(content).toContain('"key":"value"');
    expect(content).toContain('"num":42');
  });

  test("rotates files at max size", () => {
    const logDir = path.join(tmpDir, "logs");
    // Use very small max size to trigger rotation
    const logger = new Logger({ logDir, level: "debug", maxSizeMb: 0.0001, maxFiles: 3 });

    // Write enough to exceed the tiny limit
    for (let i = 0; i < 20; i++) {
      logger.info("A".repeat(100));
    }

    expect(fs.existsSync(path.join(logDir, "daemon.log"))).toBe(true);
    expect(fs.existsSync(path.join(logDir, "daemon.1.log"))).toBe(true);
  });
});
