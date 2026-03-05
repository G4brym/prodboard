import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { TmuxManager } from "../src/tmux.ts";

const manager = new TmuxManager();

describe("TmuxManager", () => {
  test("sessionName generates prodboard- prefix with 8-char ID", () => {
    const name = manager.sessionName("abc12345-6789-0000-1111-222233334444");
    expect(name).toBe("prodboard-abc12345");
  });

  test("sessionName is deterministic", () => {
    const id = "deadbeef-1234-5678-9abc-def012345678";
    expect(manager.sessionName(id)).toBe(manager.sessionName(id));
  });

  test("wrapCommand produces correct tmux new-session args", () => {
    const args = manager.wrapCommand("prodboard-abc12345", ["claude", "-p", "hello"], "/tmp/run.jsonl");
    expect(args[0]).toBe("tmux");
    expect(args[1]).toBe("new-session");
    expect(args[2]).toBe("-d");
    expect(args[3]).toBe("-s");
    expect(args[4]).toBe("prodboard-abc12345");
    expect(args[5]).toBe("bash");
    expect(args[6]).toBe("-c");
  });

  test("wrapCommand shell-escapes arguments with spaces", () => {
    const args = manager.wrapCommand("prodboard-test", ["claude", "-p", "do something complex"], "/tmp/run.jsonl");
    const bashCmd = args[7];
    expect(bashCmd).toContain("'do something complex'");
  });

  test("wrapCommand redirects stdout to jsonl path", () => {
    const args = manager.wrapCommand("prodboard-test", ["echo", "hi"], "/tmp/test.jsonl");
    const bashCmd = args[7];
    expect(bashCmd).toContain("> /tmp/test.jsonl");
  });

  test("wrapCommand writes exit code to .exit file", () => {
    const args = manager.wrapCommand("prodboard-test", ["echo", "hi"], "/tmp/test.jsonl");
    const bashCmd = args[7];
    expect(bashCmd).toContain("echo $? > /tmp/test.jsonl.exit");
  });

  test("isAvailable returns boolean", () => {
    const result = manager.isAvailable();
    expect(typeof result).toBe("boolean");
  });

  test("wrapCommand does not merge stderr into stdout", () => {
    const args = manager.wrapCommand("prodboard-test", ["echo", "hi"], "/tmp/test.jsonl");
    const bashCmd = args[7];
    expect(bashCmd).not.toContain("2>&1");
  });

  test("waitForCompletion correctly returns exit code 0", async () => {
    if (!manager.isAvailable()) return; // skip if tmux not installed
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmux-test-"));
    const jsonlPath = path.join(tmpDir, "test.jsonl");
    const exitFile = `${jsonlPath}.exit`;
    fs.writeFileSync(exitFile, "0\n");
    // Create a dummy session name that doesn't exist — has-session will fail immediately
    const exitCode = await manager.waitForCompletion("prodboard-nonexistent-test-session", jsonlPath);
    expect(exitCode).toBe(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("waitForCompletion returns 1 for non-numeric exit file", async () => {
    if (!manager.isAvailable()) return; // skip if tmux not installed
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmux-test-"));
    const jsonlPath = path.join(tmpDir, "test.jsonl");
    const exitFile = `${jsonlPath}.exit`;
    fs.writeFileSync(exitFile, "NaN\n");
    const exitCode = await manager.waitForCompletion("prodboard-nonexistent-test-session-2", jsonlPath);
    expect(exitCode).toBe(1);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("shellEscape handles single quotes in arguments", () => {
    const args = manager.wrapCommand("prodboard-test", ["echo", "it's a test"], "/tmp/test.jsonl");
    const bashCmd = args[7];
    expect(bashCmd).toContain("'it'\\''s a test'");
  });

  test("shellEscape handles backticks in arguments", () => {
    const args = manager.wrapCommand("prodboard-test", ["echo", "`whoami`"], "/tmp/test.jsonl");
    const bashCmd = args[7];
    // Should be quoted to prevent execution
    expect(bashCmd).toContain("'`whoami`'");
  });

  test("shellEscape handles dollar sign expansion", () => {
    const args = manager.wrapCommand("prodboard-test", ["echo", "$(rm -rf /)"], "/tmp/test.jsonl");
    const bashCmd = args[7];
    expect(bashCmd).toContain("'$(rm -rf /)'");
  });

  test("shellEscape handles semicolons in arguments", () => {
    const args = manager.wrapCommand("prodboard-test", ["echo", "hello; rm -rf /"], "/tmp/test.jsonl");
    const bashCmd = args[7];
    expect(bashCmd).toContain("'hello; rm -rf /'");
  });
});
