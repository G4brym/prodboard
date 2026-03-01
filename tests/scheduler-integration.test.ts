import { describe, expect, test } from "bun:test";
import * as path from "path";

const FIXTURES = path.resolve(import.meta.dir, "fixtures");

describe("Scheduler Integration", () => {
  test("fake script outputs expected JSON stream", async () => {
    const proc = Bun.spawn(["bash", path.join(FIXTURES, "fake-claude.sh")], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("test-session-123");
    expect(stdout).toContain('"tokens_in":500');
  });

  test("fake script failure exits with code 1", async () => {
    const proc = Bun.spawn(["bash", path.join(FIXTURES, "fake-claude-fail.sh")], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });
});
