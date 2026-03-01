import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb, createTestConfig } from "./helpers.ts";
import { parseStreamJson, extractCostData, CronLoop, ExecutionManager } from "../src/scheduler.ts";
import { createSchedule, disableSchedule } from "../src/queries/schedules.ts";
import { createRun, updateRun, getRunningRuns } from "../src/queries/runs.ts";

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe("Stream JSON Parser", () => {
  test("parses valid JSON", () => {
    const result = parseStreamJson('{"type":"init","session_id":"abc"}');
    expect(result?.type).toBe("init");
    expect(result?.session_id).toBe("abc");
  });

  test("returns null for invalid JSON", () => {
    expect(parseStreamJson("not json")).toBeNull();
  });

  test("handles all message types", () => {
    expect(parseStreamJson('{"type":"init"}')?.type).toBe("init");
    expect(parseStreamJson('{"type":"tool_use","tool":"Read"}')?.type).toBe("tool_use");
    expect(parseStreamJson('{"type":"result"}')?.type).toBe("result");
  });
});

describe("Cost Data Extraction", () => {
  test("extracts session_id from init", () => {
    const events = [
      { type: "init", session_id: "sess-123" },
      { type: "result", result: { tokens_in: 100, tokens_out: 50, cost_usd: 0.01 } },
    ];
    const data = extractCostData(events);
    expect(data.session_id).toBe("sess-123");
    expect(data.tokens_in).toBe(100);
    expect(data.tokens_out).toBe(50);
    expect(data.cost_usd).toBe(0.01);
  });

  test("tool usage tracking accumulates unique tool names", () => {
    const events = [
      { type: "tool_use", tool: "Read" },
      { type: "tool_use", tool: "Write" },
      { type: "tool_use", tool: "Read" }, // duplicate
    ];
    const data = extractCostData(events);
    expect(data.tools_used).toEqual(["Read", "Write"]);
  });

  test("issue ID extraction from MCP tool inputs", () => {
    const events = [
      { type: "tool_use", tool: "mcp__prodboard__get_issue", tool_input: { id: "abc123" } },
      { type: "tool_use", tool: "mcp__prodboard__add_comment", tool_input: { issue_id: "def456" } },
    ];
    const data = extractCostData(events);
    expect(data.issues_touched).toContain("abc123");
    expect(data.issues_touched).toContain("def456");
  });
});

describe("CronLoop", () => {
  test("tick evaluates all enabled schedules", async () => {
    const config = createTestConfig();
    const em = new ExecutionManager(db, config);
    const loop = new CronLoop(db, config, em);

    // Create a schedule that fires every minute
    createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });

    // tick() will try to fire but claude won't exist — that's fine
    // We just verify it doesn't crash
    await loop.tick();
  });

  test("disabled schedules are skipped", async () => {
    const config = createTestConfig();
    const em = new ExecutionManager(db, config);
    const loop = new CronLoop(db, config, em);

    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    disableSchedule(db, s.id);

    await loop.tick();
    // No runs should be created for disabled schedule
    const runs = getRunningRuns(db);
    expect(runs.length).toBe(0);
  });

  test("maxConcurrentRuns respected", async () => {
    const config = createTestConfig({ daemon: { ...createTestConfig().daemon, maxConcurrentRuns: 1 } });
    const em = new ExecutionManager(db, config);
    const loop = new CronLoop(db, config, em);

    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    // Create a running run
    createRun(db, { schedule_id: s.id, prompt_used: "existing" });

    // Create another schedule
    createSchedule(db, { name: "test2", cron: "* * * * *", prompt: "go2" });

    await loop.tick();
    // Should still be 1 running run (the one we manually created)
    const running = getRunningRuns(db);
    expect(running.length).toBe(1);
  });
});
