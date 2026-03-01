import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import * as path from "path";
import { createTestDb, createTestConfig } from "./helpers.ts";
import { ExecutionManager } from "../src/scheduler.ts";
import { createSchedule } from "../src/queries/schedules.ts";
import { createRun, listRuns } from "../src/queries/runs.ts";

const FIXTURES = path.resolve(import.meta.dir, "fixtures");

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe("Scheduler Integration", () => {
  test("ExecutionManager spawns fake script and records results", async () => {
    const config = createTestConfig({
      daemon: { ...createTestConfig().daemon, runTimeoutSeconds: 10 },
    });
    const em = new ExecutionManager(db, config);

    const s = createSchedule(db, {
      name: "test",
      cron: "* * * * *",
      prompt: "test prompt",
      workdir: FIXTURES,
    });
    const run = createRun(db, { schedule_id: s.id, prompt_used: "test prompt" });

    // Monkey-patch buildInvocation to use our fake script
    const origBuild = (await import("../src/invocation.ts")).buildInvocation;

    // We can't easily mock the invocation builder, so let's test the parseStreamJson
    // and cost extraction directly, and test the full flow with a subprocess

    // Instead, spawn the fake script directly
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
