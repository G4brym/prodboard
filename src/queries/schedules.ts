import { Database } from "bun:sqlite";
import type { Schedule } from "../types.ts";
import { generateId } from "../ids.ts";

export function createSchedule(
  db: Database,
  opts: {
    name: string;
    cron: string;
    prompt: string;
    workdir?: string;
    max_turns?: number;
    allowed_tools?: string;
    use_worktree?: boolean;
    inject_context?: boolean;
    persist_session?: boolean;
    agents_json?: string;
    source?: string;
  }
): Schedule {
  const id = generateId();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  db.query(`
    INSERT INTO schedules (id, name, cron, prompt, workdir, max_turns, allowed_tools,
      use_worktree, inject_context, persist_session, agents_json, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, opts.name, opts.cron, opts.prompt,
    opts.workdir ?? ".",
    opts.max_turns ?? null,
    opts.allowed_tools ?? null,
    opts.use_worktree !== false ? 1 : 0,
    opts.inject_context !== false ? 1 : 0,
    opts.persist_session ? 1 : 0,
    opts.agents_json ?? null,
    opts.source ?? "cli",
    now, now
  );

  return getSchedule(db, id)!;
}

export function getSchedule(db: Database, id: string): Schedule | null {
  return db.query("SELECT * FROM schedules WHERE id = ?").get(id) as Schedule | null;
}

export function getScheduleByPrefix(db: Database, prefix: string): Schedule {
  const exact = getSchedule(db, prefix);
  if (exact) return exact;

  const escaped = prefix.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const matches = db
    .query("SELECT * FROM schedules WHERE id LIKE ? || '%' ESCAPE '\\'")
    .all(escaped) as Schedule[];

  if (matches.length === 0) throw new Error(`Schedule not found: ${prefix}`);
  if (matches.length > 1) throw new Error(`Ambiguous prefix '${prefix}': matches ${matches.map((m) => m.id).join(", ")}`);
  return matches[0];
}

export function listSchedules(
  db: Database,
  opts?: { includeDisabled?: boolean }
): Schedule[] {
  if (opts?.includeDisabled) {
    return db.query("SELECT * FROM schedules ORDER BY created_at DESC").all() as Schedule[];
  }
  return db.query("SELECT * FROM schedules WHERE enabled = 1 ORDER BY created_at DESC").all() as Schedule[];
}

export function updateSchedule(
  db: Database,
  id: string,
  fields: Partial<Omit<Schedule, "id" | "created_at">>
): Schedule {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const sets: string[] = ["updated_at = ?"];
  const params: any[] = [now];

  const fieldMap: Record<string, string> = {
    name: "name", cron: "cron", prompt: "prompt", workdir: "workdir",
    enabled: "enabled", max_turns: "max_turns", allowed_tools: "allowed_tools",
    use_worktree: "use_worktree", inject_context: "inject_context",
    persist_session: "persist_session", agents_json: "agents_json",
  };

  let hasRealFields = false;
  for (const [key, col] of Object.entries(fieldMap)) {
    if ((fields as any)[key] !== undefined) {
      sets.push(`${col} = ?`);
      params.push((fields as any)[key]);
      hasRealFields = true;
    }
  }

  if (!hasRealFields) return getSchedule(db, id)!;

  params.push(id);
  db.query(`UPDATE schedules SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return getSchedule(db, id)!;
}

export function deleteSchedule(db: Database, id: string): void {
  const result = db.query("DELETE FROM schedules WHERE id = ?").run(id);
  if (result.changes === 0) throw new Error(`Schedule not found: ${id}`);
}

export function enableSchedule(db: Database, id: string): void {
  db.query("UPDATE schedules SET enabled = 1, updated_at = datetime('now') WHERE id = ?").run(id);
}

export function disableSchedule(db: Database, id: string): void {
  db.query("UPDATE schedules SET enabled = 0, updated_at = datetime('now') WHERE id = ?").run(id);
}
