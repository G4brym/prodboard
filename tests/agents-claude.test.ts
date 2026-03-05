import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb, createTestConfig } from "./helpers.ts";
import { ClaudeDriver } from "../src/agents/claude.ts";
import { createSchedule } from "../src/queries/schedules.ts";
import { createRun, updateRun } from "../src/queries/runs.ts";
import type { EnvironmentInfo } from "../src/types.ts";
import type { AgentRunContext } from "../src/agents/types.ts";

let db: Database;
const driver = new ClaudeDriver();

function makeEnv(overrides?: Partial<EnvironmentInfo>): EnvironmentInfo {
  return {
    hasGit: true,
    hasClaude: true,
    hasOpencode: false,
    worktreeSupported: true,
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<AgentRunContext>): AgentRunContext {
  const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "do stuff" });
  const r = createRun(db, { schedule_id: s.id, prompt_used: "do stuff" });
  return {
    schedule: s,
    run: r,
    config: createTestConfig(),
    env: makeEnv(),
    resolvedPrompt: "do stuff",
    workdir: "/tmp",
    db,
    ...overrides,
  };
}

beforeEach(() => {
  db = createTestDb();
});

describe("ClaudeDriver", () => {
  test("name is claude", () => {
    expect(driver.name).toBe("claude");
  });

  test("buildCommand includes all required Claude flags", () => {
    const args = driver.buildCommand(makeCtx());
    expect(args[0]).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--mcp-config");
    expect(args).toContain("--append-system-prompt-file");
  });

  test("buildCommand clamps max_turns to hardMaxTurns", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go", max_turns: 999 });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const args = driver.buildCommand(makeCtx({ schedule: s, run: r }));
    const idx = args.indexOf("--max-turns");
    expect(parseInt(args[idx + 1])).toBe(200);
  });

  test("buildCommand uses nonGitDefaultAllowedTools when no git", () => {
    const config = createTestConfig({
      daemon: {
        ...createTestConfig().daemon,
        nonGitDefaultAllowedTools: ["Read", "Write"],
      },
    });
    const args = driver.buildCommand(makeCtx({
      config,
      env: makeEnv({ hasGit: false, worktreeSupported: false }),
    }));
    const toolArgs = args.filter((_, i) => i > 0 && args[i - 1] === "--allowedTools");
    expect(toolArgs).toEqual(["Read", "Write"]);
  });

  test("buildCommand does NOT include --worktree", () => {
    const args = driver.buildCommand(makeCtx());
    expect(args).not.toContain("--worktree");
  });

  test("buildCommand handles session resume", () => {
    const s = createSchedule(db, {
      name: "test", cron: "* * * * *", prompt: "go",
      persist_session: true,
    });
    const r1 = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    updateRun(db, r1.id, { session_id: "sess-123", status: "success" });

    const r2 = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const args = driver.buildCommand(makeCtx({ schedule: s, run: r2 }));
    const idx = args.indexOf("--resume");
    expect(idx).not.toBe(-1);
    expect(args[idx + 1]).toBe("sess-123");
  });

  test("buildCommand passes agents_json", () => {
    const s = createSchedule(db, {
      name: "test", cron: "* * * * *", prompt: "go",
      agents_json: "/path/to/agents.json",
    });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const args = driver.buildCommand(makeCtx({ schedule: s, run: r }));
    const idx = args.indexOf("--agents");
    expect(idx).not.toBe(-1);
    expect(args[idx + 1]).toBe("/path/to/agents.json");
  });

  test("parseEvent parses valid Claude stream JSON", () => {
    const result = driver.parseEvent('{"type":"init","session_id":"abc"}');
    expect(result?.type).toBe("init");
    expect(result?.session_id).toBe("abc");
  });

  test("parseEvent returns null for invalid JSON", () => {
    expect(driver.parseEvent("not json")).toBeNull();
  });

  test("extractResult aggregates tokens from result event", () => {
    const events = [
      { type: "result", result: { tokens_in: 100, tokens_out: 50, cost_usd: 0.01 } },
    ];
    const result = driver.extractResult(events);
    expect(result.tokens_in).toBe(100);
    expect(result.tokens_out).toBe(50);
    expect(result.cost_usd).toBe(0.01);
  });

  test("extractResult extracts session_id from init event", () => {
    const events = [
      { type: "init", session_id: "sess-abc" },
    ];
    const result = driver.extractResult(events);
    expect(result.session_id).toBe("sess-abc");
  });

  test("extractResult tracks unique tools_used", () => {
    const events = [
      { type: "tool_use", tool: "Read" },
      { type: "tool_use", tool: "Write" },
      { type: "tool_use", tool: "Read" },
    ];
    const result = driver.extractResult(events);
    expect(result.tools_used).toEqual(["Read", "Write"]);
  });

  test("extractResult extracts issue IDs from MCP tool inputs", () => {
    const events = [
      { type: "tool_use", tool: "mcp__prodboard__get_issue", tool_input: { id: "abc123" } },
      { type: "tool_use", tool: "mcp__prodboard__add_comment", tool_input: { issue_id: "def456" } },
    ];
    const result = driver.extractResult(events);
    expect(result.issues_touched).toContain("abc123");
    expect(result.issues_touched).toContain("def456");
  });
});
