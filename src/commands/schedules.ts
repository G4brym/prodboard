import { Database } from "bun:sqlite";
import { ensureDb } from "../db.ts";
import { loadConfig } from "../config.ts";
import { validateCron, getNextFire } from "../cron.ts";
import {
  createSchedule, getScheduleByPrefix, listSchedules,
  updateSchedule, deleteSchedule, enableSchedule, disableSchedule,
} from "../queries/schedules.ts";
import { listRuns, getScheduleStats } from "../queries/runs.ts";
import { renderTable, formatDate, jsonOutput } from "../format.ts";
import { confirm } from "../confirm.ts";
import { ExecutionManager } from "../scheduler.ts";
import { createRun } from "../queries/runs.ts";

function safeParseInt(val: string | boolean | undefined): number | undefined {
  if (typeof val !== "string") return undefined;
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n;
}

function parseArgs(args: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key === "no-worktree" || key === "no-context" || key === "persist-session" || key === "force" || key === "all" || key === "json" || key === "asc") {
        flags[key] = true;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      if (key === "f" || key === "a") {
        flags[key] = true;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

export async function scheduleAdd(args: string[], dbOverride?: Database): Promise<void> {
  const { flags } = parseArgs(args);
  const db = dbOverride ?? ensureDb();

  const name = (flags.name ?? flags.n) as string;
  const cron = (flags.cron ?? flags.c) as string;
  const prompt = (flags.prompt ?? flags.p) as string;

  if (!name || !cron || !prompt) {
    console.error("Usage: prodboard schedule add --name <name> --cron <expr> --prompt <prompt>");
    throw new Error("Invalid arguments");
  }

  const validation = validateCron(cron);
  if (!validation.valid) {
    console.error(`Invalid cron expression: ${validation.error}`);
    throw new Error("Invalid arguments");
  }

  const schedule = createSchedule(db, {
    name,
    cron,
    prompt,
    workdir: (flags.workdir ?? flags.w) as string | undefined,
    max_turns: flags["max-turns"] ? parseInt(flags["max-turns"] as string, 10) : undefined,
    use_worktree: !flags["no-worktree"],
    inject_context: !flags["no-context"],
    persist_session: !!flags["persist-session"],
    model: flags.model as string | undefined,
  });

  console.log(`Created schedule ${schedule.id}: ${schedule.name} [${schedule.cron}]`);
}

export async function scheduleLs(args: string[], dbOverride?: Database): Promise<void> {
  const { flags } = parseArgs(args);
  const db = dbOverride ?? ensureDb();
  const isJson = !!flags.json;
  const all = !!(flags.all || flags.a);

  const schedules = listSchedules(db, { includeDisabled: true });

  if (isJson) {
    console.log(jsonOutput(schedules));
    return;
  }

  if (schedules.length === 0) {
    console.log("No schedules.");
    return;
  }

  const table = renderTable(
    ["ID", "Name", "Cron", "Model", "Enabled", "Next Fire"],
    schedules.map((s) => {
      let nextFire = "";
      try {
        const next = getNextFire(s.cron, new Date());
        nextFire = formatDate(next.toISOString());
      } catch {}
      return [s.id, s.name, s.cron, s.model ?? "-", s.enabled ? "yes" : "no", nextFire];
    }),
    { maxWidths: [10, 30, 20, 20, 8, 18] }
  );
  console.log(table);
  console.log(`${schedules.length} schedule${schedules.length === 1 ? "" : "s"}`);
}

export async function scheduleEdit(args: string[], dbOverride?: Database): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const idOrPrefix = positional[0];
  if (!idOrPrefix) {
    console.error("Usage: prodboard schedule edit <id> [--name name] [--cron expr] [--prompt prompt]");
    throw new Error("Invalid arguments");
  }

  const db = dbOverride ?? ensureDb();
  const schedule = getScheduleByPrefix(db, idOrPrefix);

  const fields: any = {};
  if (flags.name || flags.n) fields.name = flags.name ?? flags.n;
  if (flags.cron || flags.c) {
    const newCron = (flags.cron ?? flags.c) as string;
    const validation = validateCron(newCron);
    if (!validation.valid) {
      console.error(`Invalid cron expression: ${validation.error}`);
      throw new Error("Invalid arguments");
    }
    fields.cron = newCron;
  }
  if (flags.prompt || flags.p) fields.prompt = flags.prompt ?? flags.p;
  if (flags.workdir || flags.w) fields.workdir = flags.workdir ?? flags.w;
  if (flags["max-turns"]) fields.max_turns = parseInt(flags["max-turns"] as string, 10);
  if (flags.model !== undefined) fields.model = flags.model === "" ? null : flags.model;
  if (flags["no-worktree"]) fields.use_worktree = 0;
  if (flags["no-context"]) fields.inject_context = 0;
  if (flags["persist-session"]) fields.persist_session = 1;

  const updated = updateSchedule(db, schedule.id, fields);
  console.log(`Updated schedule ${updated.id}: ${updated.name}`);
}

export async function scheduleEnable(args: string[], dbOverride?: Database): Promise<void> {
  const { positional } = parseArgs(args);
  const idOrPrefix = positional[0];
  if (!idOrPrefix) {
    console.error("Usage: prodboard schedule enable <id>");
    throw new Error("Invalid arguments");
  }

  const db = dbOverride ?? ensureDb();
  const schedule = getScheduleByPrefix(db, idOrPrefix);
  enableSchedule(db, schedule.id);
  console.log(`Enabled schedule ${schedule.id}: ${schedule.name}`);
}

export async function scheduleDisable(args: string[], dbOverride?: Database): Promise<void> {
  const { positional } = parseArgs(args);
  const idOrPrefix = positional[0];
  if (!idOrPrefix) {
    console.error("Usage: prodboard schedule disable <id>");
    throw new Error("Invalid arguments");
  }

  const db = dbOverride ?? ensureDb();
  const schedule = getScheduleByPrefix(db, idOrPrefix);
  disableSchedule(db, schedule.id);
  console.log(`Disabled schedule ${schedule.id}: ${schedule.name}`);
}

export async function scheduleRm(args: string[], dbOverride?: Database): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const idOrPrefix = positional[0];
  if (!idOrPrefix) {
    console.error("Usage: prodboard schedule rm <id> [--force/-f]");
    throw new Error("Invalid arguments");
  }

  const db = dbOverride ?? ensureDb();
  const schedule = getScheduleByPrefix(db, idOrPrefix);

  if (!flags.force && !flags.f) {
    const ok = await confirm(`Delete schedule ${schedule.id}: ${schedule.name}?`);
    if (!ok) {
      console.log("Cancelled.");
      return;
    }
  }

  deleteSchedule(db, schedule.id);
  console.log(`Deleted schedule ${schedule.id}`);
}

export async function scheduleLogs(args: string[], dbOverride?: Database): Promise<void> {
  const { flags } = parseArgs(args);
  const db = dbOverride ?? ensureDb();
  const isJson = !!flags.json;

  const runs = listRuns(db, {
    schedule_id: (flags.schedule ?? flags.s) as string | undefined,
    status: flags.status as string | undefined,
    limit: safeParseInt(flags.limit ?? flags.n),
    include_output: isJson,
  });

  if (isJson) {
    console.log(jsonOutput(runs));
    return;
  }

  if (runs.length === 0) {
    console.log("No runs found.");
    return;
  }

  const table = renderTable(
    ["ID", "Schedule", "Status", "Started", "Exit", "Tokens"],
    runs.map((r) => [
      r.id,
      r.schedule_name ?? r.schedule_id,
      r.status,
      formatDate(r.started_at),
      r.exit_code !== null ? String(r.exit_code) : "-",
      r.tokens_in ? `${r.tokens_in}/${r.tokens_out}` : "-",
    ]),
    { maxWidths: [10, 20, 10, 18, 5, 12] }
  );
  console.log(table);
}

export async function scheduleRun(args: string[], dbOverride?: Database): Promise<void> {
  const { positional } = parseArgs(args);
  const idOrPrefix = positional[0];
  if (!idOrPrefix) {
    console.error("Usage: prodboard schedule run <id>");
    throw new Error("Invalid arguments");
  }

  const db = dbOverride ?? ensureDb();
  const config = loadConfig();
  const schedule = getScheduleByPrefix(db, idOrPrefix);

  console.log(`Running schedule ${schedule.id}: ${schedule.name}...`);

  const run = createRun(db, {
    schedule_id: schedule.id,
    prompt_used: schedule.prompt,
  });

  // CLI schedule run is a lightweight path without tmux/worktree support
  const em = new ExecutionManager(db, config);
  await em.executeRun(schedule, run);

  const updatedRun = db.query("SELECT * FROM runs WHERE id = ?").get(run.id) as any;
  console.log(`Run completed: ${updatedRun.status} (exit code: ${updatedRun.exit_code ?? "N/A"})`);
}

export async function scheduleStats(args: string[], dbOverride?: Database): Promise<void> {
  const { flags } = parseArgs(args);
  const db = dbOverride ?? ensureDb();

  const scheduleId = (flags.schedule ?? flags.s) as string | undefined;
  const days = safeParseInt(flags.days ?? flags.d);

  const stats = getScheduleStats(db, scheduleId, days);

  console.log(`Total runs: ${stats.total}`);
  console.log(`Success: ${stats.success} (${(stats.success_rate * 100).toFixed(1)}%)`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Avg tokens in: ${Math.round(stats.avg_tokens_in)}`);
  console.log(`Avg tokens out: ${Math.round(stats.avg_tokens_out)}`);
  console.log(`Total cost: $${stats.total_cost.toFixed(4)}`);
}
