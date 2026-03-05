import { Database } from "bun:sqlite";
import type { Run } from "../types.ts";
import { generateId } from "../ids.ts";

export function createRun(
  db: Database,
  opts: { schedule_id: string; prompt_used: string; pid?: number; agent?: string }
): Run {
  const id = generateId();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  db.query(`
    INSERT INTO runs (id, schedule_id, status, prompt_used, pid, agent, started_at)
    VALUES (?, ?, 'running', ?, ?, ?, ?)
  `).run(id, opts.schedule_id, opts.prompt_used, opts.pid ?? null, opts.agent ?? "claude", now);

  return db.query("SELECT * FROM runs WHERE id = ?").get(id) as Run;
}

export function updateRun(
  db: Database,
  id: string,
  fields: Partial<Omit<Run, "id" | "schedule_id" | "started_at">>
): void {
  const sets: string[] = [];
  const params: any[] = [];

  const fieldMap: Record<string, string> = {
    status: "status", finished_at: "finished_at", exit_code: "exit_code",
    stdout_tail: "stdout_tail", stderr_tail: "stderr_tail",
    session_id: "session_id", worktree_path: "worktree_path",
    tokens_in: "tokens_in", tokens_out: "tokens_out", cost_usd: "cost_usd",
    tools_used: "tools_used", issues_touched: "issues_touched",
    tmux_session: "tmux_session", agent: "agent",
    prompt_used: "prompt_used", pid: "pid",
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if ((fields as any)[key] !== undefined) {
      sets.push(`${col} = ?`);
      params.push((fields as any)[key]);
    }
  }

  if (sets.length === 0) return;

  params.push(id);
  db.query(`UPDATE runs SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function listRuns(
  db: Database,
  opts?: { schedule_id?: string; status?: string; limit?: number }
): Run[] {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts?.schedule_id) {
    conditions.push("r.schedule_id = ?");
    params.push(opts.schedule_id);
  }
  if (opts?.status) {
    conditions.push("r.status = ?");
    params.push(opts.status);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const limit = opts?.limit ?? 50;

  return db.query(`
    SELECT r.*, s.name as schedule_name
    FROM runs r
    LEFT JOIN schedules s ON r.schedule_id = s.id
    ${where}
    ORDER BY r.started_at DESC
    LIMIT ?
  `).all(...params, limit) as Run[];
}

export function getRunningRuns(db: Database): Run[] {
  return db.query("SELECT * FROM runs WHERE status = 'running'").all() as Run[];
}

export function getLastRun(db: Database, scheduleId: string): Run | null {
  return db.query(
    "SELECT * FROM runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT 1"
  ).get(scheduleId) as Run | null;
}

export function getLastSessionId(db: Database, scheduleId: string): string | null {
  const run = db.query(
    "SELECT session_id FROM runs WHERE schedule_id = ? AND session_id IS NOT NULL ORDER BY started_at DESC LIMIT 1"
  ).get(scheduleId) as { session_id: string } | null;
  return run?.session_id ?? null;
}

export function getScheduleStats(
  db: Database,
  scheduleId?: string,
  days?: number
): {
  total: number;
  success: number;
  failed: number;
  success_rate: number;
  avg_tokens_in: number;
  avg_tokens_out: number;
  total_cost: number;
} {
  const conditions: string[] = [];
  const params: any[] = [];

  if (scheduleId) {
    conditions.push("schedule_id = ?");
    params.push(scheduleId);
  }
  if (days) {
    conditions.push("started_at >= datetime('now', ? || ' days')");
    params.push(-days);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const stats = db.query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(tokens_in) as avg_tokens_in,
      AVG(tokens_out) as avg_tokens_out,
      SUM(COALESCE(cost_usd, 0)) as total_cost
    FROM runs ${where}
  `).get(...params) as any;

  return {
    total: stats.total ?? 0,
    success: stats.success ?? 0,
    failed: stats.failed ?? 0,
    success_rate: stats.total > 0 ? (stats.success ?? 0) / stats.total : 0,
    avg_tokens_in: stats.avg_tokens_in ?? 0,
    avg_tokens_out: stats.avg_tokens_out ?? 0,
    total_cost: stats.total_cost ?? 0,
  };
}

export function pruneOldRuns(db: Database, retentionDays: number): number {
  const result = db.query(
    "DELETE FROM runs WHERE started_at < datetime('now', ? || ' days')"
  ).run(-retentionDays);
  return result.changes;
}

export function getSessionRunCount(db: Database, scheduleId: string): number {
  const lastSessionId = getLastSessionId(db, scheduleId);
  if (!lastSessionId) return 0;
  const result = db.query(
    "SELECT COUNT(*) as count FROM runs WHERE schedule_id = ? AND session_id = ?"
  ).get(scheduleId, lastSessionId) as { count: number };
  return result.count;
}
