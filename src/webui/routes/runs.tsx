import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import type { Config } from "../../types.ts";
import { Layout } from "../components/layout.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { listRuns, getRunningRuns } from "../../queries/runs.ts";
import type { Run } from "../../types.ts";

export function runRoutes(db: Database, _config: Config) {
  const app = new Hono();

  app.get("/", (c) => {
    const runs = listRuns(db, { limit: 50 });
    return c.html(
      <Layout title="Runs">
        <h1>Runs</h1>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Schedule</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Started</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td><a href={`/runs/${run.id}`}>{run.id.slice(0, 8)}</a></td>
                <td>{run.schedule_name ?? run.schedule_id.slice(0, 8)}</td>
                <td>{run.agent}</td>
                <td><StatusBadge status={run.status} /></td>
                <td>{run.started_at}</td>
                <td>{run.cost_usd != null ? `$${run.cost_usd.toFixed(4)}` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Layout>
    );
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const runs = listRuns(db, { limit: 500 });
    const run = runs.find((r) => r.id === id || r.id.startsWith(id));
    if (!run) return c.text("Run not found", 404);

    return c.html(
      <Layout title={`Run ${run.id.slice(0, 8)}`}>
        <div class="detail">
          <h1>
            <StatusBadge status={run.status} />
            Run {run.id.slice(0, 8)}
          </h1>
          <div class="detail-meta">
            Schedule: {run.schedule_name ?? run.schedule_id.slice(0, 8)} |
            Agent: {run.agent} |
            Started: {run.started_at}
            {run.finished_at && ` | Finished: ${run.finished_at}`}
          </div>
          <table>
            <tbody>
              <tr><td><strong>Exit Code</strong></td><td>{run.exit_code ?? "-"}</td></tr>
              <tr><td><strong>Tokens In</strong></td><td>{run.tokens_in ?? "-"}</td></tr>
              <tr><td><strong>Tokens Out</strong></td><td>{run.tokens_out ?? "-"}</td></tr>
              <tr><td><strong>Cost</strong></td><td>{run.cost_usd != null ? `$${run.cost_usd.toFixed(4)}` : "-"}</td></tr>
              <tr><td><strong>Session ID</strong></td><td>{run.session_id ?? "-"}</td></tr>
              <tr><td><strong>tmux Session</strong></td><td>{run.tmux_session ?? "-"}</td></tr>
              <tr><td><strong>Tools Used</strong></td><td>{run.tools_used ?? "-"}</td></tr>
              <tr><td><strong>Issues Touched</strong></td><td>{run.issues_touched ?? "-"}</td></tr>
            </tbody>
          </table>
          {run.stderr_tail && (
            <div>
              <h3 style="margin-top:1rem">Stderr</h3>
              <pre class="description">{run.stderr_tail}</pre>
            </div>
          )}
        </div>
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

  return app;
}
