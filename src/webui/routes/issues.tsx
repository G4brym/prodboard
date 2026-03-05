import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import type { Config } from "../../types.ts";
import { Layout } from "../components/layout.tsx";
import { Board } from "../components/board.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import {
  listIssues, createIssue, getIssueByPrefix,
  updateIssue, deleteIssue, validateStatus,
} from "../../queries/issues.ts";
import { createComment, listComments } from "../../queries/comments.ts";

export function issueRoutes(db: Database, config: Config) {
  const app = new Hono();

  app.get("/", (c) => {
    const { issues } = listIssues(db, { includeArchived: true, limit: 500 });
    return c.html(
      <Layout title="Issues">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h1>Issues</h1>
          <a href="#new-issue" class="btn btn-primary btn-sm" onclick="document.getElementById('new-issue-form').style.display='block'">New Issue</a>
        </div>
        <div id="new-issue-form" style="display:none;margin-bottom:1rem" class="detail">
          <h2>New Issue</h2>
          <form method="post" action="/issues">
            <div class="form-row">
              <label for="title">Title</label>
              <input type="text" name="title" id="title" required />
            </div>
            <div class="form-row">
              <label for="description">Description</label>
              <textarea name="description" id="description"></textarea>
            </div>
            <div class="form-row">
              <label for="status">Status</label>
              <select name="status" id="status">
                {config.general.statuses.map((s) => (
                  <option value={s} selected={s === config.general.defaultStatus}>{s}</option>
                ))}
              </select>
            </div>
            <button type="submit" class="btn btn-primary">Create</button>
          </form>
        </div>
        <Board issues={issues} statuses={config.general.statuses} />
      </Layout>
    );
  });

  app.post("/", async (c) => {
    const body = await c.req.parseBody();
    const title = (body.title as string || "").trim();
    if (!title) return c.text("Title is required", 400);
    const status = (body.status as string) || config.general.defaultStatus;
    validateStatus(status, config);
    createIssue(db, {
      title,
      description: (body.description as string) || "",
      status,
    });
    return c.redirect("/issues");
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const issue = getIssueByPrefix(db, id);
    const comments = listComments(db, issue.id);
    return c.html(
      <Layout title={issue.title}>
        <div class="detail">
          <h1>
            <StatusBadge status={issue.status} />
            {issue.title}
          </h1>
          <div class="detail-meta">
            ID: {issue.id} | Created: {issue.created_at} | Updated: {issue.updated_at}
          </div>
          {issue.description && <div class="description">{issue.description}</div>}
          <div class="actions">
            <form method="post" action={`/issues/${issue.id}/move`} style="display:flex;gap:0.5rem;align-items:center">
              <select name="status">
                {config.general.statuses.map((s) => (
                  <option value={s} selected={s === issue.status}>{s}</option>
                ))}
              </select>
              <button type="submit" class="btn btn-primary btn-sm">Move</button>
            </form>
            <form method="post" action={`/issues/${issue.id}/delete`} onsubmit="return confirm('Delete this issue?')">
              <button type="submit" class="btn btn-danger btn-sm">Delete</button>
            </form>
          </div>
        </div>

        <div class="detail">
          <h2>Comments ({comments.length})</h2>
          {comments.map((comment) => (
            <div class="comment" key={comment.id}>
              <div>
                <span class="comment-author">{comment.author}</span>
                <span class="comment-date"> - {comment.created_at}</span>
              </div>
              <div>{comment.body}</div>
            </div>
          ))}
          <form method="post" action={`/issues/${issue.id}/comment`} style="margin-top:1rem">
            <div class="form-row">
              <textarea name="body" placeholder="Add a comment..." required></textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Comment</button>
          </form>
        </div>
      </Layout>
    );
  });

  app.post("/:id", async (c) => {
    const id = c.req.param("id");
    const issue = getIssueByPrefix(db, id);
    const body = await c.req.parseBody();
    const fields: any = {};
    if (body.title) fields.title = body.title as string;
    if (body.description !== undefined) fields.description = body.description as string;
    if (body.status) {
      validateStatus(body.status as string, config);
      fields.status = body.status as string;
    }
    updateIssue(db, issue.id, fields);
    return c.redirect(`/issues/${issue.id}`);
  });

  app.post("/:id/move", async (c) => {
    const id = c.req.param("id");
    const issue = getIssueByPrefix(db, id);
    const body = await c.req.parseBody();
    const status = body.status as string;
    validateStatus(status, config);
    updateIssue(db, issue.id, { status });
    return c.redirect(`/issues/${issue.id}`);
  });

  app.post("/:id/delete", (c) => {
    const id = c.req.param("id");
    const issue = getIssueByPrefix(db, id);
    deleteIssue(db, issue.id);
    return c.redirect("/issues");
  });

  app.post("/:id/comment", async (c) => {
    const id = c.req.param("id");
    const issue = getIssueByPrefix(db, id);
    const body = await c.req.parseBody();
    createComment(db, {
      issue_id: issue.id,
      body: body.body as string,
      author: "webui",
    });
    return c.redirect(`/issues/${issue.id}`);
  });

  return app;
}
