import { describe, expect, test } from "bun:test";
import { resolve } from "path";

const BIN = resolve(import.meta.dir, "../bin/prodboard.ts");
const BUN = process.env.HOME + "/.bun/bin/bun";

async function run(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([BUN, "run", BIN, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: "/tmp/prodboard-cli-test-nonexistent" },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe("CLI Router", () => {
  test("--version prints version and exits 0", async () => {
    const { stdout, exitCode } = await run("--version");
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("--help prints help text and exits 0", async () => {
    const { stdout, exitCode } = await run("--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("prodboard");
    expect(stdout).toContain("Commands:");
  });

  test("no args prints help and exits 0", async () => {
    const { stdout, exitCode } = await run();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Commands:");
  });

  test("unknown command prints error and exits 1", async () => {
    const { stderr, exitCode } = await run("nonexistent");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown command");
  });

  test("command without init exits 3", async () => {
    const { exitCode } = await run("ls");
    expect(exitCode).toBe(3);
  });
});
