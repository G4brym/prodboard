import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "./helpers.ts";
import { captureOutput } from "./helpers.ts";
import {
  scheduleAdd, scheduleLs, scheduleEdit, scheduleEnable,
  scheduleDisable, scheduleRm, scheduleLogs, scheduleStats,
} from "../src/commands/schedules.ts";
import { createSchedule, getSchedule, disableSchedule } from "../src/queries/schedules.ts";
import { createRun, updateRun } from "../src/queries/runs.ts";

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe("CLI Schedule Commands", () => {
  test("schedule add creates schedule", async () => {
    const { stdout } = await captureOutput(async () => {
      await scheduleAdd(["--name", "test", "--cron", "* * * * *", "--prompt", "do stuff"], db);
    });
    expect(stdout).toContain("Created schedule");
    expect(stdout).toContain("test");
  });

  test("schedule add validates cron", async () => {
    await expect(
      scheduleAdd(["--name", "test", "--cron", "bad", "--prompt", "do stuff"], db)
    ).rejects.toThrow("Invalid arguments");
  });

  test("schedule ls renders table", async () => {
    createSchedule(db, { name: "test", cron: "0 9 * * *", prompt: "go" });
    const { stdout } = await captureOutput(async () => {
      await scheduleLs([], db);
    });
    expect(stdout).toContain("test");
    expect(stdout).toContain("0 9 * * *");
  });

  test("schedule ls --json outputs JSON", async () => {
    createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const { stdout } = await captureOutput(async () => {
      await scheduleLs(["--json"], db);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.length).toBe(1);
  });

  test("schedule edit updates fields", async () => {
    const s = createSchedule(db, { name: "old", cron: "* * * * *", prompt: "go" });
    const { stdout } = await captureOutput(async () => {
      await scheduleEdit([s.id, "--name", "new"], db);
    });
    expect(stdout).toContain("Updated");
    expect(stdout).toContain("new");
  });

  test("schedule enable/disable toggles", async () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });

    await captureOutput(async () => {
      await scheduleDisable([s.id], db);
    });
    expect(getSchedule(db, s.id)!.enabled).toBe(0);

    await captureOutput(async () => {
      await scheduleEnable([s.id], db);
    });
    expect(getSchedule(db, s.id)!.enabled).toBe(1);
  });

  test("schedule rm --force deletes", async () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const { stdout } = await captureOutput(async () => {
      await scheduleRm([s.id, "--force"], db);
    });
    expect(stdout).toContain("Deleted");
    expect(getSchedule(db, s.id)).toBeNull();
  });

  test("schedule logs shows run history", async () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    updateRun(db, r.id, { status: "success", exit_code: 0 });

    const { stdout } = await captureOutput(async () => {
      await scheduleLogs([], db);
    });
    expect(stdout).toContain("success");
  });

  test("schedule stats shows aggregated stats", async () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    updateRun(db, r.id, { status: "success", tokens_in: 100, tokens_out: 50, cost_usd: 0.01 });

    const { stdout } = await captureOutput(async () => {
      await scheduleStats([], db);
    });
    expect(stdout).toContain("Total runs: 1");
    expect(stdout).toContain("Success: 1");
  });
});
