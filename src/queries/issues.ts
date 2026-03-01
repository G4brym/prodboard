import { Database } from "bun:sqlite";
import type { Issue, Config } from "../types.ts";
import { generateId } from "../ids.ts";

export function createIssue(
  db: Database,
  opts: { title: string; description?: string; status?: string }
): Issue {
  const id = generateId();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const status = opts.status ?? "todo";
  const description = opts.description ?? "";

  db.query(
    "INSERT INTO issues (id, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, opts.title, description, status, now, now);

  return { id, title: opts.title, description, status, created_at: now, updated_at: now };
}

export function getIssue(db: Database, id: string): Issue | null {
  return db.query("SELECT * FROM issues WHERE id = ?").get(id) as Issue | null;
}

export function getIssueByPrefix(db: Database, prefix: string): Issue {
  // Try exact match first
  const exact = getIssue(db, prefix);
  if (exact) return exact;

  const escaped = prefix.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const matches = db
    .query("SELECT * FROM issues WHERE id LIKE ? || '%' ESCAPE '\\'")
    .all(escaped) as Issue[];

  if (matches.length === 0) {
    throw new Error(`Issue not found: ${prefix}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous prefix '${prefix}': matches ${matches.map((m) => m.id).join(", ")}`
    );
  }
  return matches[0];
}

export function resolveIssueId(db: Database, idOrPrefix: string): string {
  return getIssueByPrefix(db, idOrPrefix).id;
}

export function listIssues(
  db: Database,
  opts?: {
    status?: string[];
    search?: string;
    sort?: string;
    order?: string;
    includeArchived?: boolean;
    limit?: number;
  }
): { issues: Issue[]; total: number } {
  const conditions: string[] = [];
  const params: any[] = [];

  if (!opts?.includeArchived) {
    conditions.push("status != 'archived'");
  }

  if (opts?.status && opts.status.length > 0) {
    const placeholders = opts.status.map(() => "?").join(", ");
    conditions.push(`status IN (${placeholders})`);
    params.push(...opts.status);
  }

  if (opts?.search) {
    conditions.push("(title LIKE '%' || ? || '%' OR description LIKE '%' || ? || '%')");
    params.push(opts.search, opts.search);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const VALID_SORT = new Set(["updated_at", "created_at", "title", "status"]);
  const VALID_ORDER = new Set(["ASC", "DESC"]);
  const sort = VALID_SORT.has(opts?.sort ?? "") ? opts!.sort! : "updated_at";
  const order = VALID_ORDER.has((opts?.order ?? "").toUpperCase()) ? (opts!.order!).toUpperCase() : "DESC";
  const limit = opts?.limit ?? 50;

  const countResult = db.query(`SELECT COUNT(*) as count FROM issues ${where}`).get(...params) as { count: number };

  const issues = db
    .query(`SELECT * FROM issues ${where} ORDER BY ${sort} ${order} LIMIT ?`)
    .all(...params, limit) as Issue[];

  return { issues, total: countResult.count };
}

export function updateIssue(
  db: Database,
  id: string,
  fields: { title?: string; description?: string; status?: string }
): Issue {
  const issue = getIssue(db, id);
  if (!issue) throw new Error(`Issue not found: ${id}`);

  const hasFields = fields.title !== undefined || fields.description !== undefined || fields.status !== undefined;
  if (!hasFields) return issue;

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const sets: string[] = ["updated_at = ?"];
  const params: any[] = [now];

  if (fields.title !== undefined) {
    sets.push("title = ?");
    params.push(fields.title);
  }
  if (fields.description !== undefined) {
    sets.push("description = ?");
    params.push(fields.description);
  }
  if (fields.status !== undefined) {
    sets.push("status = ?");
    params.push(fields.status);
  }

  params.push(id);
  db.query(`UPDATE issues SET ${sets.join(", ")} WHERE id = ?`).run(...params);

  return getIssue(db, id)!;
}

export function deleteIssue(db: Database, id: string): void {
  const result = db.query("DELETE FROM issues WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw new Error(`Issue not found: ${id}`);
  }
}

export function getIssueCounts(db: Database): Record<string, number> {
  const rows = db
    .query("SELECT status, COUNT(*) as count FROM issues GROUP BY status")
    .all() as { status: string; count: number }[];

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}

export function validateStatus(status: string, config: Config): void {
  if (!config.general.statuses.includes(status)) {
    throw new Error(
      `Invalid status '${status}'. Valid statuses: ${config.general.statuses.join(", ")}`
    );
  }
}
