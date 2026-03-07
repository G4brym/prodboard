import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "./helpers.ts";
import { createSchedule } from "../src/queries/schedules.ts";
import {
  createRun, updateRun, listRuns, getRunningRuns,
  getLastRun, getLastSessionId, getScheduleStats, pruneOldRuns,
  getSessionRunCount,
} from "../src/queries/runs.ts";

let db: Database;
let scheduleId: string;

beforeEach(() => {
  db = createTestDb();
  const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "do stuff" });
  scheduleId = s.id;
});

describe("Run Queries", () => {
  test("create run with running status", () => {
    const run = createRun(db, { schedule_id: scheduleId, prompt_used: "test prompt" });
    expect(run.status).toBe("running");
    expect(run.schedule_id).toBe(scheduleId);
  });

  test("update run with completion data", () => {
    const run = createRun(db, { schedule_id: scheduleId, prompt_used: "test" });
    updateRun(db, run.id, {
      status: "success",
      finished_at: "2026-03-01 12:00:00",
      exit_code: 0,
      tokens_in: 1000,
      tokens_out: 500,
      cost_usd: 0.05,
      session_id: "sess-123",
    });
    const updated = db.query("SELECT * FROM runs WHERE id = ?").get(run.id) as any;
    expect(updated.status).toBe("success");
    expect(updated.exit_code).toBe(0);
    expect(updated.tokens_in).toBe(1000);
    expect(updated.session_id).toBe("sess-123");
  });

  test("list runs with filters", () => {
    createRun(db, { schedule_id: scheduleId, prompt_used: "a" });
    const r2 = createRun(db, { schedule_id: scheduleId, prompt_used: "b" });
    updateRun(db, r2.id, { status: "success" });

    const running = listRuns(db, { status: "running" });
    expect(running.length).toBe(1);

    const all = listRuns(db, { schedule_id: scheduleId });
    expect(all.length).toBe(2);
  });

  test("get running runs", () => {
    createRun(db, { schedule_id: scheduleId, prompt_used: "a" });
    const r2 = createRun(db, { schedule_id: scheduleId, prompt_used: "b" });
    updateRun(db, r2.id, { status: "success" });

    const running = getRunningRuns(db);
    expect(running.length).toBe(1);
  });

  test("get last session ID", () => {
    const r = createRun(db, { schedule_id: scheduleId, prompt_used: "a" });
    updateRun(db, r.id, { session_id: "sess-abc" });

    expect(getLastSessionId(db, scheduleId)).toBe("sess-abc");
  });

  test("stats calculation", () => {
    const r1 = createRun(db, { schedule_id: scheduleId, prompt_used: "a" });
    updateRun(db, r1.id, { status: "success", tokens_in: 100, tokens_out: 50, cost_usd: 0.01 });
    const r2 = createRun(db, { schedule_id: scheduleId, prompt_used: "b" });
    updateRun(db, r2.id, { status: "failed", tokens_in: 200, tokens_out: 100, cost_usd: 0.02 });

    const stats = getScheduleStats(db, scheduleId);
    expect(stats.total).toBe(2);
    expect(stats.success).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.success_rate).toBe(0.5);
    expect(stats.total_cost).toBe(0.03);
  });

  test("prune respects retention", () => {
    const r = createRun(db, { schedule_id: scheduleId, prompt_used: "old" });
    // Manually set old timestamp
    db.query("UPDATE runs SET started_at = datetime('now', '-60 days') WHERE id = ?").run(r.id);
    createRun(db, { schedule_id: scheduleId, prompt_used: "new" });

    const pruned = pruneOldRuns(db, 30);
    expect(pruned).toBe(1);

    const remaining = listRuns(db, { include_output: true });
    expect(remaining.length).toBe(1);
    expect(remaining[0].prompt_used).toBe("new");
  });

  test("session run count", () => {
    const r1 = createRun(db, { schedule_id: scheduleId, prompt_used: "a" });
    updateRun(db, r1.id, { session_id: "sess-1" });
    const r2 = createRun(db, { schedule_id: scheduleId, prompt_used: "b" });
    updateRun(db, r2.id, { session_id: "sess-1" });

    expect(getSessionRunCount(db, scheduleId)).toBe(2);
  });
});
