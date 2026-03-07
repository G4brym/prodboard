/** @jsxImportSource hono/jsx */
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
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-xl font-semibold">Issues</h1>
            <p id="board-total" class="text-sm text-muted-foreground mt-0.5">{issues.length} total</p>
          </div>
          <button
            onclick="document.getElementById('new-issue-form').classList.toggle('hidden')"
            class="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
            New Issue
          </button>
        </div>

        <div id="new-issue-form" class="hidden mb-6">
          <div class="rounded-lg border border-border bg-card p-5">
            <h2 class="text-base font-semibold text-card-foreground mb-4">Create Issue</h2>
            <form method="post" action="/issues">
              <div class="grid gap-4">
                <div>
                  <label for="title" class="block text-sm font-medium text-foreground mb-1.5">Title</label>
                  <input type="text" name="title" id="title" required
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    placeholder="Issue title"
                  />
                </div>
                <div>
                  <label for="description" class="block text-sm font-medium text-foreground mb-1.5">Description</label>
                  <textarea name="description" id="description" rows={3}
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background resize-y"
                    placeholder="Optional description"
                  ></textarea>
                </div>
                <div>
                  <label for="status" class="block text-sm font-medium text-foreground mb-1.5">Status</label>
                  <select name="status" id="status"
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                  >
                    {config.general.statuses.map((s) => (
                      <option value={s} selected={s === config.general.defaultStatus}>{s}</option>
                    ))}
                  </select>
                </div>
                <div class="flex justify-end gap-2">
                  <button type="button"
                    onclick="document.getElementById('new-issue-form').classList.add('hidden')"
                    class="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                  >Cancel</button>
                  <button type="submit"
                    class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >Create</button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <Board issues={issues} statuses={config.general.statuses} />

        <p id="board-updated" class="text-xs text-muted-foreground/50 mt-2 text-right"></p>

        <script dangerouslySetInnerHTML={{ __html: `
(function() {
  var INTERVAL = 30000;
  var board = document.getElementById('board');
  var updatedEl = document.getElementById('board-updated');
  var statuses = JSON.parse(board.dataset.statuses);
  var lastUpdate = Date.now();

  var STATUS_STYLES = {
    'todo': 'bg-zinc-700/50 text-zinc-300 border-zinc-600',
    'in-progress': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    'review': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'done': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    'human-approval': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'running': 'bg-blue-500/15 text-blue-400 border-blue-500/30'
  };
  var DEFAULT_STYLE = 'bg-zinc-700/50 text-zinc-300 border-zinc-600';

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderBoard(issues) {
    var grouped = {};
    statuses.forEach(function(s) { grouped[s] = []; });
    issues.forEach(function(issue) {
      if (grouped[issue.status]) grouped[issue.status].push(issue);
    });

    var html = '';
    statuses.forEach(function(status) {
      var items = grouped[status] || [];
      html += '<div class="flex-1 min-w-[220px]">';
      html += '<div class="flex items-center gap-2 mb-3 px-1">';
      html += '<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">' + escapeHtml(status) + '</h3>';
      html += '<span class="text-xs text-muted-foreground/60">' + items.length + '</span>';
      html += '</div>';
      html += '<div class="space-y-2">';
      items.forEach(function(issue) {
        html += '<a href="/issues/' + escapeHtml(issue.id) + '" class="block rounded-lg border border-border bg-card p-3 hover:bg-accent transition-colors group">';
        html += '<div class="text-sm font-medium text-card-foreground group-hover:text-foreground">' + escapeHtml(issue.title) + '</div>';
        html += '<div class="text-xs text-muted-foreground mt-1 font-mono">' + escapeHtml(issue.id.slice(0, 8)) + '</div>';
        html += '</a>';
      });
      html += '</div></div>';
    });

    board.innerHTML = html;
  }

  function updateTimestamp() {
    var secs = Math.round((Date.now() - lastUpdate) / 1000);
    updatedEl.textContent = 'Updated ' + secs + 's ago';
  }

  function poll() {
    fetch('/api/issues')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(issues) {
        if (!issues) return;
        renderBoard(issues);
        var countEl = document.getElementById('board-total');
        if (countEl) countEl.textContent = issues.length + ' total';
        lastUpdate = Date.now();
        updateTimestamp();
      })
      .catch(function() {});
  }

  setInterval(poll, INTERVAL);
  setInterval(updateTimestamp, 5000);
})();
        ` }} />
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
        <div class="mb-4">
          <a href="/issues" class="text-sm text-muted-foreground hover:text-foreground transition-colors">&larr; Back to issues</a>
        </div>

        <div class="rounded-lg border border-border bg-card p-5 mb-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-center gap-3">
              <StatusBadge status={issue.status} />
              <h1 class="text-lg font-semibold text-card-foreground">{issue.title}</h1>
            </div>
          </div>
          <div class="mt-2 flex items-center gap-3 text-xs text-muted-foreground font-mono">
            <span>{issue.id}</span>
            <span>&middot;</span>
            <span>Created {issue.created_at}</span>
            <span>&middot;</span>
            <span>Updated {issue.updated_at}</span>
          </div>
          {issue.description && (
            <div class="mt-4 rounded-md bg-muted p-4 text-sm text-foreground whitespace-pre-wrap">{issue.description}</div>
          )}
          <div class="mt-4 flex items-center gap-2 pt-4 border-t border-border">
            <form method="post" action={`/issues/${issue.id}/move`} class="flex items-center gap-2">
              <select name="status"
                class="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {config.general.statuses.map((s) => (
                  <option value={s} selected={s === issue.status}>{s}</option>
                ))}
              </select>
              <button type="submit"
                class="rounded-md bg-secondary px-2.5 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >Move</button>
            </form>
            <form method="post" action={`/issues/${issue.id}/delete`} onsubmit="return confirm('Delete this issue?')">
              <button type="submit"
                class="rounded-md bg-destructive/15 border border-destructive/30 px-2.5 py-1.5 text-sm font-medium text-red-400 hover:bg-destructive/25 transition-colors"
              >Delete</button>
            </form>
          </div>
        </div>

        <div class="rounded-lg border border-border bg-card p-5">
          <h2 class="text-sm font-semibold text-card-foreground mb-4">Comments <span class="text-muted-foreground font-normal">({comments.length})</span></h2>
          {comments.length > 0 && (
            <div class="space-y-3 mb-4">
              {comments.map((comment) => (
                <div class="border-l-2 border-border pl-3 py-1" key={comment.id}>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="font-semibold text-foreground">{comment.author}</span>
                    <span class="text-muted-foreground">{comment.created_at}</span>
                  </div>
                  <div class="text-sm text-foreground/90 mt-0.5">{comment.body}</div>
                </div>
              ))}
            </div>
          )}
          <form method="post" action={`/issues/${issue.id}/comment`}>
            <textarea name="body" required rows={2}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background resize-y"
              placeholder="Add a comment..."
            ></textarea>
            <div class="flex justify-end mt-2">
              <button type="submit"
                class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >Comment</button>
            </div>
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
