import { describe, expect, test } from "bun:test";
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
});
