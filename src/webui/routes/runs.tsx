/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import type { Config } from "../../types.ts";
import { Layout } from "../components/layout.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { listRuns, getRunningRuns } from "../../queries/runs.ts";
import { listIssues } from "../../queries/issues.ts";
import type { Run } from "../../types.ts";

export function runRoutes(db: Database, _config: Config) {
  const app = new Hono();

  app.get("/", (c) => {
    const runs = listRuns(db, { limit: 50 });
    return c.html(
      <Layout title="Runs">
        <div class="mb-6">
          <h1 class="text-xl font-semibold">Runs</h1>
          <p class="text-sm text-muted-foreground mt-0.5">Recent execution history</p>
        </div>

        <div class="rounded-lg border border-border overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-b border-border bg-muted/50">
                <th class="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Schedule</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Agent</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Started</th>
                <th class="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cost</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {runs.map((run) => (
                <tr class="hover:bg-muted/30 transition-colors" key={run.id}>
                  <td class="px-4 py-3">
                    <a href={`/runs/${run.id}`} class="text-sm font-mono text-blue-400 hover:text-blue-300 hover:underline">
                      {run.id.slice(0, 8)}
                    </a>
                  </td>
                  <td class="px-4 py-3 text-sm text-foreground">{run.schedule_name ?? run.schedule_id.slice(0, 8)}</td>
                  <td class="px-4 py-3 text-sm text-muted-foreground">{run.agent}</td>
                  <td class="px-4 py-3"><StatusBadge status={run.status} /></td>
                  <td class="px-4 py-3 text-sm text-muted-foreground">{run.started_at}</td>
                  <td class="px-4 py-3 text-sm text-right font-mono text-muted-foreground">
                    {run.cost_usd != null ? `$${run.cost_usd.toFixed(4)}` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && (
            <div class="px-4 py-8 text-center text-sm text-muted-foreground">No runs yet.</div>
          )}
        </div>
      </Layout>
    );
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const runs = listRuns(db, { limit: 500 });
    const run = runs.find((r) => r.id === id || r.id.startsWith(id));
    if (!run) return c.text("Run not found", 404);

    const details = [
      { label: "Exit Code", value: run.exit_code ?? "-" },
      { label: "Tokens In", value: run.tokens_in != null ? run.tokens_in.toLocaleString() : "-" },
      { label: "Tokens Out", value: run.tokens_out != null ? run.tokens_out.toLocaleString() : "-" },
      { label: "Cost", value: run.cost_usd != null ? `$${run.cost_usd.toFixed(4)}` : "-" },
      { label: "Session ID", value: run.session_id ?? "-" },
      { label: "tmux Session", value: run.tmux_session ?? "-" },
      { label: "Tools Used", value: run.tools_used ?? "-" },
      { label: "Issues Touched", value: run.issues_touched ?? "-" },
    ];

    return c.html(
      <Layout title={`Run ${run.id.slice(0, 8)}`}>
        <div class="mb-4">
          <a href="/runs" class="text-sm text-muted-foreground hover:text-foreground transition-colors">&larr; Back to runs</a>
        </div>

        <div class="rounded-lg border border-border bg-card p-5 mb-4">
          <div class="flex items-center gap-3">
            <StatusBadge status={run.status} />
            <h1 class="text-lg font-semibold text-card-foreground font-mono">Run {run.id.slice(0, 8)}</h1>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Schedule: {run.schedule_name ?? run.schedule_id.slice(0, 8)}</span>
            <span>&middot;</span>
            <span>Agent: {run.agent}</span>
            <span>&middot;</span>
            <span>Started: {run.started_at}</span>
            {run.finished_at && (
              <>
                <span>&middot;</span>
                <span>Finished: {run.finished_at}</span>
              </>
            )}
          </div>
        </div>

        <div class="rounded-lg border border-border bg-card overflow-hidden mb-4">
          <div class="divide-y divide-border">
            {details.map((d) => (
              <div class="flex items-center px-4 py-2.5 hover:bg-muted/30 transition-colors" key={d.label}>
                <span class="text-sm font-medium text-muted-foreground w-40 shrink-0">{d.label}</span>
                <span class="text-sm text-foreground font-mono">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {run.stderr_tail && (
          <div class="rounded-lg border border-border bg-card p-5">
            <h3 class="text-sm font-semibold text-card-foreground mb-3">Stderr</h3>
            <pre class="rounded-md bg-muted p-4 text-sm text-foreground overflow-x-auto font-mono whitespace-pre-wrap">{run.stderr_tail}</pre>
          </div>
        )}
      </Layout>
    );
  });

  return app;
}

export function apiRoutes(db: Database, _config: Config) {
  const app = new Hono();

  app.get("/status", (c) => {
    const running = getRunningRuns(db);
    const recent = listRuns(db, { limit: 5 });
    return c.json({
      active_runs: running.length,
      recent_runs: recent.length,
    });
  });

  app.get("/issues", (c) => {
    const { issues } = listIssues(db, { includeArchived: true, limit: 500 });
    return c.json(issues);
  });

  return app;
}
