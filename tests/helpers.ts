import { Database } from "bun:sqlite";
import { runMigrations } from "../src/db.ts";
import type { Config } from "../src/types.ts";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  runMigrations(db);
  return db;
}

export function createTestConfig(overrides?: DeepPartial<Config>): Config {
  const defaults: Config = {
    general: {
      statuses: ["todo", "in-progress", "review", "done", "archived"],
      defaultStatus: "todo",
      idPrefix: "",
    },
    daemon: {
      agent: "claude",
      model: null,
      basePath: null,
      useTmux: true,
      opencode: {
        serverUrl: null,
        model: null,
        agent: null,
      },
      maxConcurrentRuns: 2,
      maxTurns: 50,
      hardMaxTurns: 200,
      runTimeoutSeconds: 1800,
      runRetentionDays: 30,
      logLevel: "info",
      logMaxSizeMb: 10,
      logMaxFiles: 5,
      defaultAllowedTools: [
        "Read", "Edit", "Write", "Glob", "Grep", "Bash",
        "mcp__prodboard__list_issues",
        "mcp__prodboard__get_issue",
        "mcp__prodboard__create_issue",
        "mcp__prodboard__update_issue",
        "mcp__prodboard__add_comment",
        "mcp__prodboard__board_summary",
        "mcp__prodboard__pick_next_issue",
        "mcp__prodboard__complete_issue",
      ],
      nonGitDefaultAllowedTools: [
        "Read", "Edit", "Write", "Glob", "Grep", "Bash",
        "mcp__prodboard__list_issues",
        "mcp__prodboard__get_issue",
        "mcp__prodboard__create_issue",
        "mcp__prodboard__update_issue",
        "mcp__prodboard__add_comment",
        "mcp__prodboard__board_summary",
        "mcp__prodboard__pick_next_issue",
        "mcp__prodboard__complete_issue",
      ],
      useWorktrees: "auto",
    },
    webui: {
      enabled: false,
      port: 3838,
      hostname: "127.0.0.1",
      password: null,
    },
  };

  if (!overrides) return defaults;
  return deepMergeConfig(defaults, overrides as any);
}

function deepMergeConfig(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMergeConfig(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function createTempDir(): { path: string; cleanup: () => void } {
  const tmpDir = `${import.meta.dir}/../.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fs = require("fs");
  fs.mkdirSync(tmpDir, { recursive: true });
  return {
    path: tmpDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

export async function captureOutput(fn: () => Promise<void>): Promise<{ stdout: string; stderr: string }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const origLog = console.log;
  const origError = console.error;

  console.log = (...args: any[]) => {
    stdoutChunks.push(args.map(String).join(" "));
  };
  console.error = (...args: any[]) => {
    stderrChunks.push(args.map(String).join(" "));
  };

  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origError;
  }

  return {
    stdout: stdoutChunks.join("\n"),
    stderr: stderrChunks.join("\n"),
  };
}
