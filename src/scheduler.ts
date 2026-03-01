import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as path from "path";
import type { Config, Schedule, Run } from "./types.ts";
import { PRODBOARD_DIR } from "./config.ts";
import { shouldFire } from "./cron.ts";
import { detectEnvironment, buildInvocation } from "./invocation.ts";
import { listSchedules } from "./queries/schedules.ts";
import { createRun, updateRun, getRunningRuns, pruneOldRuns } from "./queries/runs.ts";
import { resolveTemplate, buildTemplateContext } from "./templates.ts";

// Stream JSON event types
export interface StreamEvent {
  type: string;
  session_id?: string;
  tool?: string;
  tool_input?: any;
  result?: {
    tokens_in?: number;
    tokens_out?: number;
    cost_usd?: number;
  };
  [key: string]: any;
}

export function parseStreamJson(line: string): StreamEvent | null {
  try {
    const parsed = JSON.parse(line.trim());
    return parsed;
  } catch {
    return null;
  }
}

export function extractCostData(events: StreamEvent[]): {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  session_id: string | null;
  tools_used: string[];
  issues_touched: string[];
} {
  let tokens_in = 0;
  let tokens_out = 0;
  let cost_usd = 0;
  let session_id: string | null = null;
  const tools_used = new Set<string>();
  const issues_touched = new Set<string>();

  for (const event of events) {
    if (event.type === "init" && event.session_id) {
      session_id = event.session_id;
    }
    if (event.type === "tool_use" && event.tool) {
      tools_used.add(event.tool);
      // Track prodboard issue IDs from tool inputs
      if (event.tool.startsWith("mcp__prodboard__") && event.tool_input?.id) {
        issues_touched.add(event.tool_input.id);
      }
      if (event.tool.startsWith("mcp__prodboard__") && event.tool_input?.issue_id) {
        issues_touched.add(event.tool_input.issue_id);
      }
    }
    if (event.type === "result") {
      if (event.result?.tokens_in) tokens_in = event.result.tokens_in;
      if (event.result?.tokens_out) tokens_out = event.result.tokens_out;
      if (event.result?.cost_usd) cost_usd = event.result.cost_usd;
    }
    // Also handle top-level fields some stream formats use
    if (event.tokens_in) tokens_in = event.tokens_in;
    if (event.tokens_out) tokens_out = event.tokens_out;
    if (event.cost_usd) cost_usd = event.cost_usd;
  }

  return {
    tokens_in,
    tokens_out,
    cost_usd,
    session_id,
    tools_used: [...tools_used],
    issues_touched: [...issues_touched],
  };
}

class RingBuffer {
  private buffer: string[] = [];
  constructor(private maxSize: number) {}

  push(line: string): void {
    this.buffer.push(line);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  toString(): string {
    return this.buffer.join("\n");
  }

  get lines(): string[] {
    return [...this.buffer];
  }
}

export class ExecutionManager {
  constructor(private db: Database, private config: Config) {}

  async executeRun(schedule: Schedule, run: Run): Promise<void> {
    const env = detectEnvironment(schedule.workdir, this.config);

    // Resolve prompt templates
    let resolvedPrompt = schedule.prompt;
    try {
      const context = buildTemplateContext(this.db, schedule.name);
      resolvedPrompt = resolveTemplate(schedule.prompt, context);

      if (schedule.inject_context) {
        resolvedPrompt = `[prodboard: ${context.boardSummary}]\n\n${resolvedPrompt}`;
      }
    } catch {}

    const args = buildInvocation(schedule, run, this.config, env, resolvedPrompt, this.db);

    // Update run with PID (will be set after spawn)
    const stdoutBuffer = new RingBuffer(500);
    const stderrBuffer = new RingBuffer(100);
    const events: StreamEvent[] = [];

    let proc: any;
    try {
      proc = Bun.spawn(args, {
        cwd: schedule.workdir,
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });

      updateRun(this.db, run.id, { pid: proc.pid });

      // Set up timeout
      const timeoutMs = this.config.daemon.runTimeoutSeconds * 1000;
      const timeoutId = setTimeout(() => {
        try {
          proc.kill("SIGTERM");
          setTimeout(() => {
            try { proc.kill("SIGKILL"); } catch {}
          }, 10000);
        } catch {}
      }, timeoutMs);

      // Read stdout line by line
      if (proc.stdout) {
        const reader = proc.stdout.getReader();
        let buffer = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += new TextDecoder().decode(value);
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (line.trim()) {
                stdoutBuffer.push(line);
                const event = parseStreamJson(line);
                if (event) events.push(event);
              }
            }
          }
        } catch {}
        reader.releaseLock();
      }

      // Read stderr
      if (proc.stderr) {
        const stderrText = await new Response(proc.stderr).text();
        for (const line of stderrText.split("\n")) {
          if (line.trim()) stderrBuffer.push(line);
        }
      }

      const exitCode = await proc.exited;
      clearTimeout(timeoutId);

      const costData = extractCostData(events);
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);

      let status: string;
      if (exitCode === 0) {
        status = "success";
      } else if (exitCode === null) {
        status = "timeout";
      } else {
        status = "failed";
      }

      updateRun(this.db, run.id, {
        status,
        finished_at: now,
        exit_code: exitCode,
        stdout_tail: stdoutBuffer.toString(),
        stderr_tail: stderrBuffer.toString(),
        session_id: costData.session_id,
        tokens_in: costData.tokens_in,
        tokens_out: costData.tokens_out,
        cost_usd: costData.cost_usd,
        tools_used: costData.tools_used.length > 0 ? JSON.stringify(costData.tools_used) : null,
        issues_touched: costData.issues_touched.length > 0 ? JSON.stringify(costData.issues_touched) : null,
      });
    } catch (err: any) {
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      updateRun(this.db, run.id, {
        status: "failed",
        finished_at: now,
        stderr_tail: err.message,
      });
    }
  }
}

export class CronLoop {
  private interval: Timer | null = null;
  private lastFired: Map<string, number> = new Map();

  constructor(
    private db: Database,
    private config: Config,
    private executionManager: ExecutionManager
  ) {}

  start(): void {
    this.interval = setInterval(() => this.tick(), 30_000);
    // Also tick immediately
    this.tick();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async tick(): Promise<void> {
    try {
      const now = new Date();
      const minuteTs = Math.floor(now.getTime() / 60000);

      const schedules = listSchedules(this.db);

      for (const schedule of schedules) {
        try {
          if (!shouldFire(schedule.cron, now)) continue;

          // Prevent double-fire within same minute
          const lastFiredMinute = this.lastFired.get(schedule.id);
          if (lastFiredMinute === minuteTs) continue;

          // Check concurrent limit
          const runningRuns = getRunningRuns(this.db);
          if (runningRuns.length >= this.config.daemon.maxConcurrentRuns) continue;

          this.lastFired.set(schedule.id, minuteTs);

          const run = createRun(this.db, {
            schedule_id: schedule.id,
            prompt_used: schedule.prompt,
          });

          // Execute async - don't block the loop
          this.executionManager.executeRun(schedule, run).catch(() => {});
        } catch {}
      }
    } catch {}
  }
}

export class CleanupWorker {
  private interval: Timer | null = null;

  constructor(private db: Database, private config: Config) {}

  start(): void {
    this.interval = setInterval(() => this.cleanup(), 3600_000); // 1 hour
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async cleanup(): Promise<void> {
    try {
      const pruned = pruneOldRuns(this.db, this.config.daemon.runRetentionDays);
      if (pruned > 0) {
        console.error(`[prodboard] Cleaned up ${pruned} old runs`);
      }
    } catch {}
  }
}

export class Daemon {
  private cronLoop: CronLoop;
  private cleanupWorker: CleanupWorker;
  private executionManager: ExecutionManager;

  constructor(private db: Database, private config: Config) {
    this.executionManager = new ExecutionManager(db, config);
    this.cronLoop = new CronLoop(db, config, this.executionManager);
    this.cleanupWorker = new CleanupWorker(db, config);
  }

  async start(): Promise<void> {
    this.recoverCrashedRuns();
    this.writePidFile();
    this.cronLoop.start();
    this.cleanupWorker.start();

    process.on("SIGTERM", () => this.stop());
    process.on("SIGINT", () => this.stop());

    console.error(`[prodboard] Daemon started (PID ${process.pid})`);
  }

  async stop(): Promise<void> {
    console.error("[prodboard] Shutting down...");
    this.cronLoop.stop();
    this.cleanupWorker.stop();

    // Wait for running processes
    const running = getRunningRuns(this.db);
    if (running.length > 0) {
      console.error(`[prodboard] Waiting for ${running.length} running process(es)...`);
      // Give them 30 seconds
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const still = getRunningRuns(this.db);
        if (still.length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Mark remaining as cancelled
      const stillRunning = getRunningRuns(this.db);
      for (const run of stillRunning) {
        const now = new Date().toISOString().replace("T", " ").slice(0, 19);
        updateRun(this.db, run.id, { status: "cancelled", finished_at: now });
        if (run.pid) {
          try { process.kill(run.pid, "SIGTERM"); } catch {}
        }
      }
    }

    this.removePidFile();
    process.exit(0);
  }

  private writePidFile(): void {
    const pidFile = path.join(PRODBOARD_DIR, "daemon.pid");
    fs.writeFileSync(pidFile, String(process.pid));
  }

  private removePidFile(): void {
    try {
      const pidFile = path.join(PRODBOARD_DIR, "daemon.pid");
      fs.unlinkSync(pidFile);
    } catch {}
  }

  private recoverCrashedRuns(): void {
    const running = getRunningRuns(this.db);
    for (const run of running) {
      let alive = false;
      if (run.pid) {
        try {
          process.kill(run.pid, 0);
          alive = true;
        } catch {}
      }

      if (!alive) {
        const now = new Date().toISOString().replace("T", " ").slice(0, 19);
        updateRun(this.db, run.id, {
          status: "failed",
          finished_at: now,
          stderr_tail: "Recovered from crash — process not found",
        });
      }
    }
  }
}
