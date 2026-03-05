import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb, createTestConfig } from "./helpers.ts";
import { CronLoop, ExecutionManager } from "../src/scheduler.ts";
import { ClaudeDriver } from "../src/agents/claude.ts";
import { createSchedule, disableSchedule } from "../src/queries/schedules.ts";
import { createRun, updateRun, getRunningRuns } from "../src/queries/runs.ts";

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe("ClaudeDriver parseEvent / extractResult", () => {
  const driver = new ClaudeDriver();

  test("parses valid JSON", () => {
    const result = driver.parseEvent('{"type":"init","session_id":"abc"}');
    expect(result?.type).toBe("init");
    expect(result?.session_id).toBe("abc");
  });

  test("returns null for invalid JSON", () => {
    expect(driver.parseEvent("not json")).toBeNull();
  });

  test("handles all message types", () => {
    expect(driver.parseEvent('{"type":"init"}')?.type).toBe("init");
    expect(driver.parseEvent('{"type":"tool_use","tool":"Read"}')?.type).toBe("tool_use");
    expect(driver.parseEvent('{"type":"result"}')?.type).toBe("result");
  });

  test("extracts session_id from init", () => {
    const events = [
      { type: "init", session_id: "sess-123" },
      { type: "result", result: { tokens_in: 100, tokens_out: 50, cost_usd: 0.01 } },
    ];
    const data = driver.extractResult(events);
    expect(data.session_id).toBe("sess-123");
    expect(data.tokens_in).toBe(100);
    expect(data.tokens_out).toBe(50);
    expect(data.cost_usd).toBe(0.01);
  });

  test("tool usage tracking accumulates unique tool names", () => {
    const events = [
      { type: "tool_use", tool: "Read" },
      { type: "tool_use", tool: "Write" },
      { type: "tool_use", tool: "Read" },
    ];
    const data = driver.extractResult(events);
    expect(data.tools_used).toEqual(["Read", "Write"]);
  });

  test("issue ID extraction from MCP tool inputs", () => {
    const events = [
      { type: "tool_use", tool: "mcp__prodboard__get_issue", tool_input: { id: "abc123" } },
      { type: "tool_use", tool: "mcp__prodboard__add_comment", tool_input: { issue_id: "def456" } },
    ];
    const data = driver.extractResult(events);
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

    // tick() will try to fire but claude won't exist — execution will fail
    // but a run record should still be created
    await loop.tick();

    const { listRuns } = await import("../src/queries/runs.ts");
    const runs = listRuns(db, {});
    expect(runs.length).toBeGreaterThanOrEqual(1);
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
