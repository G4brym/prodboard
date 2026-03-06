import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ensureDb } from "../db.ts";
import { loadConfig, loadConfigRaw, validateConfig, checkWebuiDependencies, PRODBOARD_DIR } from "../config.ts";
import { listSchedules } from "../queries/schedules.ts";
import { getNextFire } from "../cron.ts";
import { formatDate } from "../format.ts";
import { Daemon } from "../scheduler.ts";
import { systemctlAvailable, runSystemctl } from "./install.ts";

function parseArgs(args: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key === "dry-run" || key === "foreground") {
        flags[key] = true;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      if (key === "f") {
        flags.foreground = true;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

export async function daemonStart(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const db = ensureDb();
  const config = loadConfig();

  if (flags["dry-run"]) {
    const schedules = listSchedules(db);
    if (schedules.length === 0) {
      console.log("No active schedules.");
      return;
    }

    console.log("Active schedules (dry run):\n");
    for (const s of schedules) {
      let nextFire = "N/A";
      try {
        const next = getNextFire(s.cron, new Date());
        nextFire = formatDate(next.toISOString());
      } catch {}
      console.log(`  ${s.id}  ${s.name}`);
      console.log(`    Cron: ${s.cron}`);
      console.log(`    Next: ${nextFire}`);
      console.log();
    }
    return;
  }

  const daemon = new Daemon(db, config);
  await daemon.start();

  // Keep process alive
  await new Promise(() => {});
}

export async function daemonStatus(args: string[]): Promise<void> {
  const pidFile = path.join(PRODBOARD_DIR, "daemon.pid");

  if (!fs.existsSync(pidFile)) {
    console.log("Daemon is not running (no PID file).");
    return;
  }

  const pidStr = fs.readFileSync(pidFile, "utf-8").trim();
  const pid = parseInt(pidStr, 10);

  let running = false;
  try {
    process.kill(pid, 0);
    running = true;
  } catch {}

  if (running) {
    console.log(`Daemon is running (PID ${pid}).`);

    // Show next scheduled runs
    try {
      const db = ensureDb();
      const schedules = listSchedules(db);
      if (schedules.length > 0) {
        console.log("\nUpcoming runs:");
        for (const s of schedules) {
          try {
            const next = getNextFire(s.cron, new Date());
            console.log(`  ${s.name}: ${formatDate(next.toISOString())}`);
          } catch {}
        }
      }
    } catch {}
  } else {
    console.log(`Daemon is not running (stale PID file: ${pid}).`);
    // Clean up stale PID file
    try { fs.unlinkSync(pidFile); } catch {}
  }
}

export async function daemonRestart(_args: string[]): Promise<void> {
  // Validate config
  let config;
  try {
    const { config: cfg, rawParsed } = loadConfigRaw();
    config = cfg;
    const { errors, warnings } = validateConfig(rawParsed);
    for (const e of errors) {
      console.error(`✗ Config: ${e}`);
    }
    if (errors.length > 0) {
      process.exit(1);
    }
    for (const w of warnings) {
      console.warn(`⚠ Config: ${w}`);
    }
  } catch (err: any) {
    console.error(`Config error: ${err.message}`);
    process.exit(1);
  }

  // Check webui dependencies
  if (config.webui.enabled) {
    const depWarnings = await checkWebuiDependencies();
    for (const w of depWarnings) {
      console.warn(`⚠ ${w}`);
    }
  }

  // Check systemd availability
  if (!(await systemctlAvailable())) {
    console.error("systemd is not available. daemon restart requires systemd.");
    process.exit(1);
  }

  // Check service file exists
  const servicePath = path.join(os.homedir(), ".config", "systemd", "user", "prodboard.service");
  if (!fs.existsSync(servicePath)) {
    console.error("prodboard is not installed as a systemd service. Run: prodboard install");
    process.exit(1);
  }

  // Restart and show status
  const restart = await runSystemctl("restart", "prodboard");
  if (restart.exitCode !== 0) {
    console.error("Failed to restart prodboard:", restart.stderr);
    process.exit(1);
  }

  console.log("prodboard daemon restarted.");
  const { stdout } = await runSystemctl("status", "prodboard");
  console.log(stdout);
}
