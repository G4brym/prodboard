import { Database } from "bun:sqlite";
import * as path from "path";
import * as fs from "fs";
import { PRODBOARD_DIR } from "./config.ts";

export function getDbPath(): string {
  return path.join(PRODBOARD_DIR, "db.sqlite");
}

export function getDb(dbPath?: string): Database {
  const p = dbPath ?? getDbPath();
  if (p !== ":memory:") {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  const db = new Database(p);
  if (p !== ":memory:") {
    db.exec("PRAGMA journal_mode=WAL");
  }
  db.exec("PRAGMA foreign_keys=ON");
  return db;
}

export function ensureDb(): Database {
  return getDb(getDbPath());
}

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        body TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cron TEXT NOT NULL,
        prompt TEXT NOT NULL,
        workdir TEXT NOT NULL DEFAULT '.',
        enabled INTEGER NOT NULL DEFAULT 1,
        max_turns INTEGER,
        allowed_tools TEXT,
        use_worktree INTEGER NOT NULL DEFAULT 1,
        inject_context INTEGER NOT NULL DEFAULT 1,
        persist_session INTEGER NOT NULL DEFAULT 0,
        agents_json TEXT,
        source TEXT NOT NULL DEFAULT 'cli',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        prompt_used TEXT NOT NULL,
        pid INTEGER,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        exit_code INTEGER,
        stdout_tail TEXT,
        stderr_tail TEXT,
        session_id TEXT,
        worktree_path TEXT,
        tokens_in INTEGER,
        tokens_out INTEGER,
        cost_usd REAL,
        tools_used TEXT,
        issues_touched TEXT,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
      CREATE INDEX IF NOT EXISTS idx_issues_updated ON issues(updated_at);
      CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);
      CREATE INDEX IF NOT EXISTS idx_runs_schedule ON runs(schedule_id);
      CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
      CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE runs ADD COLUMN tmux_session TEXT;
      ALTER TABLE runs ADD COLUMN agent TEXT NOT NULL DEFAULT 'claude';
    `,
  },
  {
    version: 3,
    sql: `ALTER TABLE schedules ADD COLUMN model TEXT;`,
  },
];

export { MIGRATIONS };

function splitStatements(sql: string): string[] {
  const results: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) results.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) results.push(trimmed);
  return results;
}

function execStatements(db: Database, sql: string): void {
  for (const stmt of splitStatements(sql)) {
    db.exec(stmt);
  }
}

export function runMigrations(db: Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );

  const appliedRows = db.query("SELECT version FROM _migrations ORDER BY version").all() as { version: number }[];
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    db.exec("BEGIN TRANSACTION");
    try {
      execStatements(db, migration.sql);
      db.exec(`INSERT INTO _migrations (version) VALUES (${migration.version})`);
      db.exec("COMMIT");
    } catch (err: any) {
      try { db.exec("ROLLBACK"); } catch {}
      throw new Error(`Migration v${migration.version} failed: ${err.message}`);
    }
  }
}
