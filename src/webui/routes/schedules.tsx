import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import type { Config } from "../../types.ts";
import { Layout } from "../components/layout.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import {
  listSchedules, createSchedule, getScheduleByPrefix,
  updateSchedule, deleteSchedule, enableSchedule, disableSchedule,
} from "../../queries/schedules.ts";
import { validateCron } from "../../cron.ts";
import { getLastRun } from "../../queries/runs.ts";

export function scheduleRoutes(db: Database, _config: Config) {
  const app = new Hono();

  app.get("/", (c) => {
    const schedules = listSchedules(db, { includeDisabled: true });
    return c.html(
      <Layout title="Schedules">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h1>Schedules</h1>
          <a href="#" class="btn btn-primary btn-sm" onclick="document.getElementById('new-schedule-form').style.display='block'">New Schedule</a>
        </div>
        <div id="new-schedule-form" style="display:none;margin-bottom:1rem" class="detail">
          <h2>New Schedule</h2>
          <form method="post" action="/schedules">
            <div class="form-row">
              <label for="name">Name</label>
              <input type="text" name="name" id="name" required />
            </div>
            <div class="form-row">
              <label for="cron">Cron Expression</label>
              <input type="text" name="cron" id="cron" placeholder="*/30 * * * *" required />
            </div>
            <div class="form-row">
              <label for="prompt">Prompt</label>
              <textarea name="prompt" id="prompt" required></textarea>
            </div>
            <div class="form-row">
              <label for="workdir">Working Directory</label>
              <input type="text" name="workdir" id="workdir" placeholder="." />
            </div>
            <button type="submit" class="btn btn-primary">Create</button>
          </form>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Cron</th>
              <th>Enabled</th>
              <th>Last Run</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => {
              const lastRun = getLastRun(db, s.id);
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><code>{s.cron}</code></td>
                  <td>{s.enabled ? "Yes" : "No"}</td>
                  <td>
                    {lastRun ? <StatusBadge status={lastRun.status} /> : "Never"}
                  </td>
                  <td>
                    <form method="post" action={`/schedules/${s.id}/toggle`} style="display:inline">
                      <button type="submit" class="btn btn-sm btn-primary">
                        {s.enabled ? "Disable" : "Enable"}
                      </button>
                    </form>
                    {" "}
                    <form method="post" action={`/schedules/${s.id}/delete`} style="display:inline" onsubmit="return confirm('Delete?')">
                      <button type="submit" class="btn btn-sm btn-danger">Delete</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Layout>
    );
  });

  app.post("/", async (c) => {
    const body = await c.req.parseBody();
    const name = (body.name as string || "").trim();
    const cron = (body.cron as string || "").trim();
    const prompt = (body.prompt as string || "").trim();
    if (!name) return c.text("Name is required", 400);
    if (!cron) return c.text("Cron expression is required", 400);
    if (!prompt) return c.text("Prompt is required", 400);
    const validation = validateCron(cron);
    if (!validation.valid) {
      return c.text(`Invalid cron expression: ${validation.error}`, 400);
    }
    createSchedule(db, {
      name,
      cron,
      prompt,
      workdir: (body.workdir as string) || ".",
      source: "webui",
    });
    return c.redirect("/schedules");
  });

  app.post("/:id", async (c) => {
    const id = c.req.param("id");
    const schedule = getScheduleByPrefix(db, id);
    const body = await c.req.parseBody();
    const fields: any = {};
    if (body.name) fields.name = body.name as string;
    if (body.cron) {
      const validation = validateCron(body.cron as string);
      if (!validation.valid) return c.text(`Invalid cron: ${validation.error}`, 400);
      fields.cron = body.cron as string;
    }
    if (body.prompt) fields.prompt = body.prompt as string;
    updateSchedule(db, schedule.id, fields);
    return c.redirect("/schedules");
  });

  app.post("/:id/toggle", (c) => {
    const id = c.req.param("id");
    const schedule = getScheduleByPrefix(db, id);
    if (schedule.enabled) {
      disableSchedule(db, schedule.id);
    } else {
      enableSchedule(db, schedule.id);
    }
    return c.redirect("/schedules");
  });

  app.post("/:id/delete", (c) => {
    const id = c.req.param("id");
    const schedule = getScheduleByPrefix(db, id);
    deleteSchedule(db, schedule.id);
    return c.redirect("/schedules");
  });

  return app;
}
