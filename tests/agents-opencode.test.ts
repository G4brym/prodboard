import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb, createTestConfig } from "./helpers.ts";
import { OpenCodeDriver } from "../src/agents/opencode.ts";
import { createSchedule } from "../src/queries/schedules.ts";
import { createRun, updateRun } from "../src/queries/runs.ts";
import type { EnvironmentInfo } from "../src/types.ts";
import type { AgentRunContext } from "../src/agents/types.ts";

let db: Database;
const driver = new OpenCodeDriver();

function makeEnv(overrides?: Partial<EnvironmentInfo>): EnvironmentInfo {
  return {
    hasGit: true,
    hasClaude: false,
    hasOpencode: true,
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
    config: createTestConfig({ daemon: { ...createTestConfig().daemon, agent: "opencode" } }),
    env: makeEnv(),
    resolvedPrompt: "do stuff",
    workdir: "/tmp/project",
    db,
    ...overrides,
  };
}

beforeEach(() => {
  db = createTestDb();
});

describe("OpenCodeDriver", () => {
  test("name is opencode", () => {
    expect(driver.name).toBe("opencode");
  });

  test("buildCommand produces opencode run with --format json", () => {
    const args = driver.buildCommand(makeCtx());
    expect(args[0]).toBe("opencode");
    expect(args[1]).toBe("run");
    expect(args[2]).toBe("do stuff");
    expect(args).toContain("--format");
    expect(args).toContain("json");
  });

  test("buildCommand includes --dir for workdir", () => {
    const args = driver.buildCommand(makeCtx());
    const idx = args.indexOf("--dir");
    expect(idx).not.toBe(-1);
    expect(args[idx + 1]).toBe("/tmp/project");
  });

  test("buildCommand includes --attach when server URL provided", () => {
    const config = createTestConfig({
      daemon: {
        ...createTestConfig().daemon,
        agent: "opencode",
        opencode: { serverUrl: "http://localhost:4096", model: null, agent: null },
      },
    });
    const args = driver.buildCommand(makeCtx({ config }));
    const idx = args.indexOf("--attach");
    expect(idx).not.toBe(-1);
    expect(args[idx + 1]).toBe("http://localhost:4096");
  });

  test("buildCommand includes --model when configured", () => {
    const config = createTestConfig({
      daemon: {
        ...createTestConfig().daemon,
        agent: "opencode",
        opencode: { serverUrl: null, model: "anthropic/claude-sonnet-4-20250514", agent: null },
      },
    });
    const args = driver.buildCommand(makeCtx({ config }));
    const idx = args.indexOf("--model");
    expect(idx).not.toBe(-1);
    expect(args[idx + 1]).toBe("anthropic/claude-sonnet-4-20250514");
  });

  test("buildCommand includes --agent when configured", () => {
    const config = createTestConfig({
      daemon: {
        ...createTestConfig().daemon,
        agent: "opencode",
        opencode: { serverUrl: null, model: null, agent: "coder" },
      },
    });
    const args = driver.buildCommand(makeCtx({ config }));
    const idx = args.indexOf("--agent");
    expect(idx).not.toBe(-1);
    expect(args[idx + 1]).toBe("coder");
  });

  test("buildCommand includes --session and --continue for resume", () => {
    const s = createSchedule(db, {
      name: "test", cron: "* * * * *", prompt: "go",
      persist_session: true,
    });
    const r1 = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    updateRun(db, r1.id, { session_id: "sess-oc-1", status: "success" });

    const r2 = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig({ daemon: { ...createTestConfig().daemon, agent: "opencode" } });
    const args = driver.buildCommand(makeCtx({ schedule: s, run: r2, config }));
    expect(args).toContain("--session");
    expect(args).toContain("--continue");
    const idx = args.indexOf("--session");
    expect(args[idx + 1]).toBe("sess-oc-1");
  });

  test("buildCommand does NOT include Claude-specific flags", () => {
    const args = driver.buildCommand(makeCtx());
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--mcp-config");
    expect(args).not.toContain("--output-format");
    expect(args).not.toContain("--append-system-prompt-file");
    expect(args).not.toContain("--allowedTools");
  });

  test("parseEvent strips SSE data: prefix", () => {
    const result = driver.parseEvent('data: {"type":"session.updated"}');
    expect(result?.type).toBe("session.updated");
  });

  test("parseEvent parses raw JSON lines", () => {
    const result = driver.parseEvent('{"type":"message.part.updated"}');
    expect(result?.type).toBe("message.part.updated");
  });

  test("parseEvent returns null for non-JSON lines", () => {
    expect(driver.parseEvent("not json at all")).toBeNull();
    expect(driver.parseEvent("")).toBeNull();
  });

  test("extractResult handles OpenCode event format", () => {
    const events = [
      {
        type: "session.updated",
        session: {
          id: "sess-oc-abc",
          usage: { input_tokens: 500, output_tokens: 200, cost_usd: 0.03 },
        },
      },
      { type: "tool_use", tool: "Read" },
      { type: "tool_use", tool: "Write" },
    ];
    const result = driver.extractResult(events);
    expect(result.session_id).toBe("sess-oc-abc");
    expect(result.tokens_in).toBe(500);
    expect(result.tokens_out).toBe(200);
    expect(result.cost_usd).toBe(0.03);
    expect(result.tools_used).toEqual(["Read", "Write"]);
  });

  test("extractResult handles message.part.updated tool events", () => {
    const events = [
      {
        type: "message.part.updated",
        part: { type: "tool-invocation", toolName: "Bash" },
      },
    ];
    const result = driver.extractResult(events);
    expect(result.tools_used).toContain("Bash");
  });
});
