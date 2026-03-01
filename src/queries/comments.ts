import { Database } from "bun:sqlite";
import type { Comment } from "../types.ts";
import { generateId } from "../ids.ts";

export function createComment(
  db: Database,
  opts: { issue_id: string; body: string; author?: string }
): Comment {
  const id = generateId();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const author = opts.author ?? "user";

  db.query(
    "INSERT INTO comments (id, issue_id, body, author, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, opts.issue_id, opts.body, author, now);

  return { id, issue_id: opts.issue_id, body: opts.body, author, created_at: now };
}

export function listComments(db: Database, issueId: string): Comment[] {
  return db
    .query("SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at ASC")
    .all(issueId) as Comment[];
}

export function getCommentCount(db: Database, issueId: string): number {
  const result = db
    .query("SELECT COUNT(*) as count FROM comments WHERE issue_id = ?")
    .get(issueId) as { count: number };
  return result.count;
}
