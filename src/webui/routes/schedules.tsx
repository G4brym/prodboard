/** @jsxImportSource hono/jsx */
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
import { getLastRun, createRun } from "../../queries/runs.ts";
import { loadConfig } from "../../config.ts";
import { ExecutionManager } from "../../scheduler.ts";

export function scheduleRoutes(db: Database, _config: Config) {
  const app = new Hono();

  app.get("/", (c) => {
    const schedules = listSchedules(db, { includeDisabled: true });
    return c.html(
      <Layout title="Schedules">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-xl font-semibold">Schedules</h1>
            <p class="text-sm text-muted-foreground mt-0.5">{schedules.length} total</p>
          </div>
          <button
            onclick="document.getElementById('new-schedule-form').classList.toggle('hidden')"
            class="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
            New Schedule
          </button>
        </div>

        <div id="new-schedule-form" class="hidden mb-6">
          <div class="rounded-lg border border-border bg-card p-5">
            <h2 class="text-base font-semibold text-card-foreground mb-4">Create Schedule</h2>
            <form method="post" action="/schedules">
              <div class="grid gap-4">
                <div>
                  <label for="name" class="block text-sm font-medium text-foreground mb-1.5">Name</label>
                  <input type="text" name="name" id="name" required
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    placeholder="Schedule name"
                  />
                </div>
                <div>
                  <label for="cron" class="block text-sm font-medium text-foreground mb-1.5">Cron Expression</label>
                  <input type="text" name="cron" id="cron" required
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    placeholder="*/30 * * * *"
                  />
                </div>
                <div>
                  <label for="prompt" class="block text-sm font-medium text-foreground mb-1.5">Prompt</label>
                  <textarea name="prompt" id="prompt" required rows={3}
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background resize-y"
                    placeholder="What should the agent do?"
                  ></textarea>
                </div>
                <div>
                  <label for="workdir" class="block text-sm font-medium text-foreground mb-1.5">Working Directory</label>
                  <input type="text" name="workdir" id="workdir"
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    placeholder="."
                  />
                </div>
                <div class="flex justify-end gap-2">
                  <button type="button"
                    onclick="document.getElementById('new-schedule-form').classList.add('hidden')"
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

        <div class="rounded-lg border border-border overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-b border-border bg-muted/50">
                <th class="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cron</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Run</th>
                <th class="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {schedules.map((s) => {
                const lastRun = getLastRun(db, s.id);
                return (
                  <tr class="hover:bg-muted/30 transition-colors" key={s.id}>
                    <td class="px-4 py-3">
                      <div class="text-sm font-medium text-foreground">{s.name}</div>
                      <div class="text-xs text-muted-foreground font-mono mt-0.5">{s.id.slice(0, 8)}</div>
                    </td>
                    <td class="px-4 py-3 text-sm text-muted-foreground font-mono">{s.cron}</td>
                    <td class="px-4 py-3">
                      {s.enabled
                        ? <span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">enabled</span>
                        : <span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border bg-zinc-700/30 text-zinc-500 border-zinc-600/50">disabled</span>
                      }
                    </td>
                    <td class="px-4 py-3 text-sm">
                      {lastRun ? <StatusBadge status={lastRun.status} /> : <span class="text-muted-foreground">Never</span>}
                    </td>
                    <td class="px-4 py-3 text-right">
                      <div class="flex items-center justify-end gap-1.5">
                        <form method="post" action={`/schedules/${s.id}/run`}>
                          <button type="submit"
                            class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                          >Run once</button>
                        </form>
                        <form method="post" action={`/schedules/${s.id}/toggle`}>
                          <button type="submit"
                            class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                          >
                            {s.enabled ? "Disable" : "Enable"}
                          </button>
                        </form>
                        <form method="post" action={`/schedules/${s.id}/delete`} onsubmit="return confirm('Delete this schedule?')">
                          <button type="submit"
                            class="rounded-md bg-destructive/15 border border-destructive/30 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-destructive/25 transition-colors"
                          >Delete</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {schedules.length === 0 && (
            <div class="px-4 py-8 text-center text-sm text-muted-foreground">No schedules yet.</div>
          )}
        </div>
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

  app.post("/:id/run", async (c) => {
    const id = c.req.param("id");
    const schedule = getScheduleByPrefix(db, id);
    const config = loadConfig();
    const run = createRun(db, {
      schedule_id: schedule.id,
      prompt_used: schedule.prompt,
      agent: config.daemon.agent,
    });
    const em = new ExecutionManager(db, config);
    em.executeRun(schedule, run).catch(() => {});
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
