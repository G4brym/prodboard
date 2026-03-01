import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "./helpers.ts";
import {
  handleListSchedules, handleCreateSchedule, handleUpdateSchedule,
  handleDeleteSchedule, handleListRuns,
} from "../src/mcp.ts";
import { createSchedule } from "../src/queries/schedules.ts";
import { createRun, updateRun } from "../src/queries/runs.ts";

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe("MCP Schedule Tools", () => {
  test("create_schedule creates with source='mcp'", async () => {
    const result = await handleCreateSchedule(db, {
      name: "test",
      cron: "0 9 * * *",
      prompt: "do stuff",
    });
    expect(result.source).toBe("mcp");
    expect(result.name).toBe("test");
  });

  test("create_schedule validates cron expression", async () => {
    await expect(
      handleCreateSchedule(db, { name: "bad", cron: "invalid", prompt: "go" })
    ).rejects.toThrow("Invalid cron");
  });

  test("list_schedules includes last run info", async () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    updateRun(db, r.id, { status: "success", finished_at: "2026-03-01 12:00:00" });

    const result = await handleListSchedules(db, {}) as any[];
    expect(result.length).toBe(1);
    expect(result[0].last_run).toBeTruthy();
    expect(result[0].last_run.status).toBe("success");
  });

  test("update_schedule partial updates work", async () => {
    const s = createSchedule(db, { name: "old", cron: "* * * * *", prompt: "go" });
    const result = await handleUpdateSchedule(db, { id: s.id, name: "new" });
    expect(result.name).toBe("new");
    expect(result.cron).toBe("* * * * *");
  });

  test("delete_schedule removes schedule and runs", async () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    createRun(db, { schedule_id: s.id, prompt_used: "go" });

    const result = await handleDeleteSchedule(db, { id: s.id });
    expect(result.deleted).toBe(true);

    const runs = await handleListRuns(db, { schedule_id: s.id });
    expect(runs.length).toBe(0);
  });

  test("list_runs filters by schedule_id and status", async () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const r1 = createRun(db, { schedule_id: s.id, prompt_used: "a" });
    updateRun(db, r1.id, { status: "success" });
    createRun(db, { schedule_id: s.id, prompt_used: "b" });

    const running = await handleListRuns(db, { status: "running" });
    expect(running.length).toBe(1);

    const all = await handleListRuns(db, { schedule_id: s.id });
    expect(all.length).toBe(2);
  });
});
