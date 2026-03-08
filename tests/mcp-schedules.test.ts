import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb, createTestConfig } from "./helpers.ts";
import {
  handleListSchedules, handleCreateSchedule, handleUpdateSchedule,
  handleDeleteSchedule, handleListRuns, handleTriggerSchedule,
} from "../src/mcp.ts";
import { createSchedule, updateSchedule } from "../src/queries/schedules.ts";
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

describe("trigger_schedule", () => {
  test("creates a run and returns run info", async () => {
    const config = createTestConfig();
    const s = createSchedule(db, { name: "trigger-test", cron: "0 9 * * *", prompt: "do work" });

    const result = await handleTriggerSchedule(db, config, { id: s.id });

    expect(result.run_id).toBeTruthy();
    expect(result.schedule_id).toBe(s.id);
    expect(result.schedule_name).toBe("trigger-test");
    expect(result.status).toBe("started");

    // Verify the run was created in the DB
    const runs = await handleListRuns(db, { schedule_id: s.id });
    expect(runs.length).toBe(1);
    expect(runs[0].id).toBe(result.run_id);
  });

  test("works with schedule ID prefix", async () => {
    const config = createTestConfig();
    const s = createSchedule(db, { name: "prefix-test", cron: "0 9 * * *", prompt: "go" });

    const result = await handleTriggerSchedule(db, config, { id: s.id.slice(0, 4) });
    expect(result.schedule_id).toBe(s.id);
  });

  test("rejects when concurrent run limit reached", async () => {
    const config = createTestConfig({ daemon: { maxConcurrentRuns: 1 } });
    const s = createSchedule(db, { name: "limit-test", cron: "0 9 * * *", prompt: "go" });

    // Create a running run to hit the limit
    createRun(db, { schedule_id: s.id, prompt_used: "go" });

    await expect(
      handleTriggerSchedule(db, config, { id: s.id })
    ).rejects.toThrow("Concurrent run limit reached");
  });

  test("rejects disabled schedule", async () => {
    const config = createTestConfig();
    const s = createSchedule(db, { name: "disabled-test", cron: "0 9 * * *", prompt: "go" });
    updateSchedule(db, s.id, { enabled: 0 });

    await expect(
      handleTriggerSchedule(db, config, { id: s.id })
    ).rejects.toThrow("disabled");
  });

  test("throws for non-existent schedule", async () => {
    const config = createTestConfig();

    await expect(
      handleTriggerSchedule(db, config, { id: "nonexistent" })
    ).rejects.toThrow();
  });
});
