import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb, createTestConfig } from "./helpers.ts";
import { buildInvocation } from "../src/invocation.ts";
import { createSchedule } from "../src/queries/schedules.ts";
import { createRun, updateRun } from "../src/queries/runs.ts";
import type { EnvironmentInfo, Schedule, Run } from "../src/types.ts";

let db: Database;

function makeEnv(overrides?: Partial<EnvironmentInfo>): EnvironmentInfo {
  return {
    hasGit: true,
    hasClaude: true,
    worktreeSupported: true,
    ...overrides,
  };
}

beforeEach(() => {
  db = createTestDb();
});

describe("Invocation Builder", () => {
  test("basic invocation includes all required flags", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "do stuff" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "do stuff" });
    const config = createTestConfig();
    const args = buildInvocation(s, r, config, makeEnv(), "do stuff", db);

    expect(args[0]).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--mcp-config");
    expect(args).toContain("--append-system-prompt-file");
  });

  test("max turns clamped to hardMaxTurns", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go", max_turns: 999 });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const args = buildInvocation(s, r, config, makeEnv(), "go", db);

    const idx = args.indexOf("--max-turns");
    expect(parseInt(args[idx + 1])).toBe(200); // hardMaxTurns
  });

  test("schedule max_turns overrides config default", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go", max_turns: 10 });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const args = buildInvocation(s, r, config, makeEnv(), "go", db);

    const idx = args.indexOf("--max-turns");
    expect(parseInt(args[idx + 1])).toBe(10);
  });

  test("non-git environment uses nonGitDefaultAllowedTools", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig({
      daemon: {
        ...createTestConfig().daemon,
        nonGitDefaultAllowedTools: ["Read", "Write"],
      },
    });
    const env = makeEnv({ hasGit: false, worktreeSupported: false });
    const args = buildInvocation(s, r, config, env, "go", db);

    const toolArgs = args.filter((_, i) => i > 0 && args[i - 1] === "--allowedTools");
    expect(toolArgs).toEqual(["Read", "Write"]);
  });

  test("schedule allowed_tools overrides everything", () => {
    const s = createSchedule(db, {
      name: "test", cron: "* * * * *", prompt: "go",
      allowed_tools: '["CustomTool"]',
    });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const args = buildInvocation(s, r, config, makeEnv(), "go", db);

    const toolArgs = args.filter((_, i) => i > 0 && args[i - 1] === "--allowedTools");
    expect(toolArgs).toEqual(["CustomTool"]);
  });

  test("worktree flag added when supported", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const args = buildInvocation(s, r, config, makeEnv(), "go", db);
    expect(args).toContain("--worktree");
  });

  test("no worktree flag when use_worktree=false", () => {
    const s = createSchedule(db, {
      name: "test", cron: "* * * * *", prompt: "go",
      use_worktree: false,
    });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const args = buildInvocation(s, r, config, makeEnv(), "go", db);
    expect(args).not.toContain("--worktree");
  });

  test("session resume adds --resume with last session ID", () => {
    const s = createSchedule(db, {
      name: "test", cron: "* * * * *", prompt: "go",
      persist_session: true,
    });
    const r1 = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    updateRun(db, r1.id, { session_id: "sess-123", status: "success" });

    const r2 = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const args = buildInvocation(s, r2, config, makeEnv(), "go", db);

    const idx = args.indexOf("--resume");
    expect(idx).not.toBe(-1);
    expect(args[idx + 1]).toBe("sess-123");
  });

  test("no --resume on first run", () => {
    const s = createSchedule(db, {
      name: "test", cron: "* * * * *", prompt: "go",
      persist_session: true,
    });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const args = buildInvocation(s, r, config, makeEnv(), "go", db);
    expect(args).not.toContain("--resume");
  });

  test("non-git selects system-prompt-nogit.md", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const env = makeEnv({ hasGit: false, worktreeSupported: false });
    const args = buildInvocation(s, r, config, env, "go", db);

    const idx = args.indexOf("--append-system-prompt-file");
    expect(args[idx + 1]).toContain("system-prompt-nogit.md");
  });

  test("git selects system-prompt.md", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const args = buildInvocation(s, r, config, makeEnv(), "go", db);

    const idx = args.indexOf("--append-system-prompt-file");
    expect(args[idx + 1]).toContain("system-prompt.md");
    expect(args[idx + 1]).not.toContain("nogit");
  });

  test("agents JSON passed through", () => {
    const s = createSchedule(db, {
      name: "test", cron: "* * * * *", prompt: "go",
      agents_json: "/path/to/agents.json",
    });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig();
    const args = buildInvocation(s, r, config, makeEnv(), "go", db);

    const idx = args.indexOf("--agents");
    expect(idx).not.toBe(-1);
    expect(args[idx + 1]).toBe("/path/to/agents.json");
  });

  test("malformed allowed_tools JSON falls back to config defaults", () => {
    const s = createSchedule(db, {
      name: "test", cron: "* * * * *", prompt: "go",
      allowed_tools: "not valid json{{{",
    });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const config = createTestConfig({
      daemon: {
        ...createTestConfig().daemon,
        defaultAllowedTools: ["Bash", "Read"],
      },
    });
    const args = buildInvocation(s, r, config, makeEnv(), "go", db);

    const toolArgs = args.filter((_, i) => i > 0 && args[i - 1] === "--allowedTools");
    expect(toolArgs).toEqual(["Bash", "Read"]);
  });
});
