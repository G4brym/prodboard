import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, runMigrations, MIGRATIONS } from "../src/db.ts";

describe("Database Module", () => {
  test("opens in-memory DB successfully", () => {
    const db = getDb(":memory:");
    expect(db).toBeDefined();
    db.close();
  });

  test("WAL mode is set for file-based DBs", () => {
    const fs = require("fs");
    const tmpPath = `/tmp/prodboard-test-wal-${Date.now()}.sqlite`;
    try {
      const db = getDb(tmpPath);
      const result = db.query("PRAGMA journal_mode").get() as any;
      expect(result.journal_mode).toBe("wal");
      db.close();
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
      try { fs.unlinkSync(tmpPath + "-wal"); } catch {}
      try { fs.unlinkSync(tmpPath + "-shm"); } catch {}
    }
  });

  test("foreign keys are enabled", () => {
    const db = getDb(":memory:");
    const result = db.query("PRAGMA foreign_keys").get() as any;
    expect(result.foreign_keys).toBe(1);
    db.close();
  });

  test("migration v1 creates all 4 tables", () => {
    const db = getDb(":memory:");
    runMigrations(db);

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name != '_migrations' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("issues");
    expect(tableNames).toContain("comments");
    expect(tableNames).toContain("schedules");
    expect(tableNames).toContain("runs");
    db.close();
  });

  test("migration v1 creates indexes", () => {
    const db = getDb(":memory:");
    runMigrations(db);

    const indexes = db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain("idx_issues_status");
    expect(indexNames).toContain("idx_issues_updated");
    expect(indexNames).toContain("idx_comments_issue");
    expect(indexNames).toContain("idx_runs_schedule");
    expect(indexNames).toContain("idx_runs_status");
    expect(indexNames).toContain("idx_runs_started");
    db.close();
  });

  test("_migrations records applied version", () => {
    const db = getDb(":memory:");
    runMigrations(db);

    const versions = db.query("SELECT version FROM _migrations").all() as { version: number }[];
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(1);
    db.close();
  });

  test("running migrations twice is idempotent", () => {
    const db = getDb(":memory:");
    runMigrations(db);
    runMigrations(db); // should not throw

    const versions = db.query("SELECT version FROM _migrations").all() as { version: number }[];
    expect(versions.length).toBe(1);
    db.close();
  });

  test("issues table has correct columns", () => {
    const db = getDb(":memory:");
    runMigrations(db);

    const columns = db.query("PRAGMA table_info(issues)").all() as { name: string; type: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual(["id", "title", "description", "status", "created_at", "updated_at"]);
    db.close();
  });

  test("comments table has correct columns", () => {
    const db = getDb(":memory:");
    runMigrations(db);

    const columns = db.query("PRAGMA table_info(comments)").all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual(["id", "issue_id", "body", "author", "created_at"]);
    db.close();
  });

  test("schedules table has correct columns", () => {
    const db = getDb(":memory:");
    runMigrations(db);

    const columns = db.query("PRAGMA table_info(schedules)").all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain("id");
    expect(colNames).toContain("name");
    expect(colNames).toContain("cron");
    expect(colNames).toContain("prompt");
    expect(colNames).toContain("workdir");
    expect(colNames).toContain("enabled");
    expect(colNames).toContain("max_turns");
    expect(colNames).toContain("allowed_tools");
    expect(colNames).toContain("use_worktree");
    expect(colNames).toContain("inject_context");
    expect(colNames).toContain("persist_session");
    expect(colNames).toContain("agents_json");
    expect(colNames).toContain("source");
    db.close();
  });

  test("runs table has correct columns", () => {
    const db = getDb(":memory:");
    runMigrations(db);

    const columns = db.query("PRAGMA table_info(runs)").all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain("id");
    expect(colNames).toContain("schedule_id");
    expect(colNames).toContain("status");
    expect(colNames).toContain("prompt_used");
    expect(colNames).toContain("pid");
    expect(colNames).toContain("tokens_in");
    expect(colNames).toContain("tokens_out");
    expect(colNames).toContain("cost_usd");
    expect(colNames).toContain("tools_used");
    expect(colNames).toContain("issues_touched");
    db.close();
  });
});
