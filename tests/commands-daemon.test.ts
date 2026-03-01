import { describe, expect, test } from "bun:test";
import { resolve } from "path";
import * as fs from "fs";
import { init } from "../src/commands/init.ts";
import { captureOutput, createTempDir } from "./helpers.ts";

const BUN = process.env.HOME + "/.bun/bin/bun";
const BIN = resolve(import.meta.dir, "../bin/prodboard.ts");

describe("CLI Daemon Commands", () => {
  test("daemon --dry-run lists schedules", async () => {
    const tmp = createTempDir();
    const prodboardDir = `${tmp.path}/.prodboard`;
    await init([], prodboardDir);

    // Create a schedule via DB
    const { Database } = await import("bun:sqlite");
    const { resolve: pResolve } = await import("path");
    const db = new Database(pResolve(prodboardDir, "db.sqlite"));
    db.exec("PRAGMA foreign_keys=ON");
    const { createSchedule } = await import("../src/queries/schedules.ts");
    createSchedule(db, { name: "test-sched", cron: "0 9 * * *", prompt: "hello" });
    db.close();

    const proc = Bun.spawn([BUN, "run", BIN, "daemon", "--dry-run"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: tmp.path },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("test-sched");
    expect(stdout).toContain("0 9 * * *");

    tmp.cleanup();
  });

  test("daemon status shows not running when no PID file", async () => {
    const tmp = createTempDir();
    const prodboardDir = `${tmp.path}/.prodboard`;
    await init([], prodboardDir);

    const proc = Bun.spawn([BUN, "run", BIN, "daemon", "status"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: tmp.path },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("not running");

    tmp.cleanup();
  });
});
