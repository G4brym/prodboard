import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as path from "path";
import type { Config, Schedule, Run } from "./types.ts";
import { PRODBOARD_DIR } from "./config.ts";
import { shouldFire } from "./cron.ts";
import { detectEnvironment } from "./invocation.ts";
import { listSchedules } from "./queries/schedules.ts";
import { createRun, updateRun, getRunningRuns, pruneOldRuns } from "./queries/runs.ts";
import { resolveTemplate, buildTemplateContext } from "./templates.ts";
import { createAgentDriver } from "./agents/index.ts";
import type { AgentDriver, StreamEvent } from "./agents/types.ts";
import { TmuxManager } from "./tmux.ts";
import { WorktreeManager } from "./worktree.ts";
import { OpenCodeServerManager } from "./opencode-server.ts";

// Re-export for backward compatibility
export type { StreamEvent };

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
  constructor(
    private db: Database,
    private config: Config,
    private driver: AgentDriver = createAgentDriver(config),
    private tmuxManager?: TmuxManager,
    private worktreeManager?: WorktreeManager,
  ) {}

  async executeRun(schedule: Schedule, run: Run): Promise<void> {
    const baseWorkdir = this.config.daemon.basePath ?? schedule.workdir;
    const env = detectEnvironment(baseWorkdir, this.config);

    // Resolve prompt templates
    let resolvedPrompt = schedule.prompt;
    try {
      const context = buildTemplateContext(this.db, schedule.name);
      resolvedPrompt = resolveTemplate(schedule.prompt, context);

      if (schedule.inject_context) {
        resolvedPrompt = `[prodboard: ${context.boardSummary}]\n\n${resolvedPrompt}`;
      }
    } catch {}

    // Create worktree if applicable
    let worktreePath: string | null = null;
    let effectiveWorkdir = baseWorkdir;

    if (
      this.worktreeManager &&
      this.config.daemon.useWorktrees !== "never" &&
      schedule.use_worktree !== 0 &&
      this.worktreeManager.isGitRepo(baseWorkdir)
    ) {
      try {
        worktreePath = await this.worktreeManager.create(run.id, baseWorkdir);
        effectiveWorkdir = worktreePath;
        updateRun(this.db, run.id, { worktree_path: worktreePath });
      } catch (err: any) {
        console.error(`[prodboard] Warning: Failed to create worktree: ${err.message}`);
      }
    }

    const args = this.driver.buildCommand({
      schedule,
      run,
      config: this.config,
      env,
      resolvedPrompt,
      workdir: effectiveWorkdir,
      db: this.db,
    });

    const stdoutBuffer = new RingBuffer(500);
    const stderrBuffer = new RingBuffer(100);
    const events: StreamEvent[] = [];

    const useTmux = this.config.daemon.useTmux && this.tmuxManager?.isAvailable();
    let tmuxSessionName: string | null = null;
    let jsonlPath: string | null = null;
    let timeoutId: Timer | undefined;
    let timedOut = false;

    try {
      if (useTmux && this.tmuxManager) {
        // tmux path: spawn detached session, wait for completion, read events from file
        tmuxSessionName = this.tmuxManager.sessionName(run.id);
        jsonlPath = `/tmp/prodboard-${run.id}.jsonl`;
        const wrappedArgs = this.tmuxManager.wrapCommand(tmuxSessionName, args, jsonlPath);

        Bun.spawnSync(wrappedArgs, { cwd: effectiveWorkdir, env: process.env });
        updateRun(this.db, run.id, { tmux_session: tmuxSessionName });

        // Set up timeout
        const timeoutMs = this.config.daemon.runTimeoutSeconds * 1000;
        timeoutId = setTimeout(() => {
          timedOut = true;
          if (tmuxSessionName && this.tmuxManager) {
            this.tmuxManager.killSession(tmuxSessionName);
          }
        }, timeoutMs);

        const exitCode = await this.tmuxManager.waitForCompletion(tmuxSessionName, jsonlPath);

        // Read JSONL file for events
        try {
          const content = fs.readFileSync(jsonlPath, "utf-8");
          for (const line of content.split("\n")) {
            if (line.trim()) {
              stdoutBuffer.push(line);
              const event = this.driver.parseEvent(line);
              if (event) events.push(event);
            }
          }
        } catch {}

        const result = this.driver.extractResult(events);
        const now = new Date().toISOString().replace("T", " ").slice(0, 19);

        updateRun(this.db, run.id, {
          status: timedOut ? "timeout" : exitCode === 0 ? "success" : "failed",
          finished_at: now,
          exit_code: exitCode,
          stdout_tail: stdoutBuffer.toString(),
          session_id: result.session_id,
          tokens_in: result.tokens_in,
          tokens_out: result.tokens_out,
          cost_usd: result.cost_usd,
          tools_used: result.tools_used.length > 0 ? JSON.stringify(result.tools_used) : null,
          issues_touched: result.issues_touched.length > 0 ? JSON.stringify(result.issues_touched) : null,
        });
      } else {
        // Direct spawn path (no tmux)
        const proc = Bun.spawn(args, {
          cwd: effectiveWorkdir,
          stdout: "pipe",
          stderr: "pipe",
          env: process.env,
        });

        updateRun(this.db, run.id, { pid: proc.pid });

        const timeoutMs = this.config.daemon.runTimeoutSeconds * 1000;
        timeoutId = setTimeout(() => {
          try {
            proc.kill("SIGTERM");
            setTimeout(() => {
              try { proc.kill("SIGKILL"); } catch {}
            }, 10000);
          } catch {}
        }, timeoutMs);

        if (proc.stdout) {
          const reader = proc.stdout.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (line.trim()) {
                  stdoutBuffer.push(line);
                  const event = this.driver.parseEvent(line);
                  if (event) events.push(event);
                }
              }
            }
          } catch {}
          reader.releaseLock();
        }

        if (proc.stderr) {
          const stderrText = await new Response(proc.stderr).text();
          for (const line of stderrText.split("\n")) {
            if (line.trim()) stderrBuffer.push(line);
          }
        }

        const exitCode = await proc.exited;
        const result = this.driver.extractResult(events);
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
          session_id: result.session_id,
          tokens_in: result.tokens_in,
          tokens_out: result.tokens_out,
          cost_usd: result.cost_usd,
          tools_used: result.tools_used.length > 0 ? JSON.stringify(result.tools_used) : null,
          issues_touched: result.issues_touched.length > 0 ? JSON.stringify(result.issues_touched) : null,
        });
      }
    } catch (err: any) {
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      updateRun(this.db, run.id, {
        status: "failed",
        finished_at: now,
        stderr_tail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);

      // Clean up worktree
      if (worktreePath && this.worktreeManager) {
        try { await this.worktreeManager.remove(run.id); } catch {}
      }

      // Clean up tmux JSONL temp file
      if (jsonlPath) {
        try { fs.unlinkSync(jsonlPath); } catch {}
        try { fs.unlinkSync(`${jsonlPath}.exit`); } catch {}
      }
    }
  }
}

export class CronLoop {
  private interval: Timer | null = null;
  private lastFired: Map<string, number> = new Map();
  private isRunning = false;

  constructor(
    private db: Database,
    private config: Config,
    private executionManager: ExecutionManager
  ) {}

  start(): void {
    this.interval = setInterval(() => this.tick(), 30_000);
    this.tick();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const now = new Date();
      const minuteTs = Math.floor(now.getTime() / 60000);

      const schedules = listSchedules(this.db);

      // Snapshot running count once before creating any new runs this tick.
      // Without this, createRun() for schedule A inserts a 'running' row that
      // getRunningRuns() would count when evaluating schedule B, causing
      // schedules with identical cron patterns to block each other.
      const runningCount = getRunningRuns(this.db).length;
      let newRunsThisTick = 0;

      for (const schedule of schedules) {
        try {
          if (!shouldFire(schedule.cron, now)) continue;

          const lastFiredMinute = this.lastFired.get(schedule.id);
          if (lastFiredMinute === minuteTs) continue;

          if (runningCount + newRunsThisTick >= this.config.daemon.maxConcurrentRuns) break;

          const run = createRun(this.db, {
            schedule_id: schedule.id,
            prompt_used: schedule.prompt,
            agent: this.config.daemon.agent,
          });

          this.lastFired.set(schedule.id, minuteTs);
          newRunsThisTick++;

          this.executionManager.executeRun(schedule, run).catch(() => {});
        } catch (err) {
          console.error(`[prodboard] Error evaluating schedule ${schedule.id}:`, err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      console.error("[prodboard] Error in tick:", err instanceof Error ? err.message : String(err));
    } finally {
      this.isRunning = false;
    }
  }
}

export class CleanupWorker {
  private interval: Timer | null = null;

  constructor(private db: Database, private config: Config) {}

  start(): void {
    this.interval = setInterval(() => this.cleanup(), 3600_000);
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
  private tmuxManager: TmuxManager;
  private worktreeManager?: WorktreeManager;
  private openCodeServer?: OpenCodeServerManager;
  private webServer?: any;

  constructor(private db: Database, private config: Config) {
    const driver = createAgentDriver(config);
    this.tmuxManager = new TmuxManager();
    if (config.daemon.basePath) {
      this.worktreeManager = new WorktreeManager(config.daemon.basePath);
    }
    this.executionManager = new ExecutionManager(db, config, driver, this.tmuxManager, this.worktreeManager);
    this.cronLoop = new CronLoop(db, config, this.executionManager);
    this.cleanupWorker = new CleanupWorker(db, config);
  }

  async start(): Promise<void> {
    this.recoverCrashedRuns();

    // Check tmux availability
    if (this.config.daemon.useTmux) {
      if (this.tmuxManager.isAvailable()) {
        console.error("[prodboard] tmux available — sessions will be attachable");
      } else {
        console.error("[prodboard] Warning: useTmux is true but tmux is not installed");
      }
    }

    // Start OpenCode server if needed
    if (this.config.daemon.agent === "opencode") {
      this.openCodeServer = new OpenCodeServerManager(this.config);
      try {
        const url = await this.openCodeServer.ensureRunning();
        console.error(`[prodboard] OpenCode server running at ${url}`);
      } catch (err: any) {
        console.error(`[prodboard] Warning: Could not start OpenCode server: ${err.message}`);
      }
    }

    this.writePidFile();
    this.cronLoop.start();
    this.cleanupWorker.start();

    // Start web UI if enabled
    if (this.config.webui.enabled) {
      try {
        const { startWebUI } = await import("./webui/index.ts");
        this.webServer = await startWebUI(this.db, this.config);
      } catch (err: any) {
        console.error(`[prodboard] Warning: Could not start web UI: ${err.message}`);
      }
    }

    process.on("SIGTERM", () => this.stop());
    process.on("SIGINT", () => this.stop());

    console.error(`[prodboard] Daemon started (PID ${process.pid}, agent: ${this.config.daemon.agent})`);
  }

  async stop(): Promise<void> {
    console.error("[prodboard] Shutting down...");
    this.cronLoop.stop();
    this.cleanupWorker.stop();

    // Kill running tmux sessions
    const running = getRunningRuns(this.db);
    for (const run of running) {
      if (run.tmux_session) {
        this.tmuxManager.killSession(run.tmux_session);
      }
    }

    if (running.length > 0) {
      console.error(`[prodboard] Waiting for ${running.length} running process(es)...`);
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const still = getRunningRuns(this.db);
        if (still.length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const stillRunning = getRunningRuns(this.db);
      for (const run of stillRunning) {
        if (run.pid) {
          try { process.kill(run.pid, "SIGTERM"); } catch {}
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      for (const run of stillRunning) {
        if (run.pid) {
          try { process.kill(run.pid, "SIGKILL"); } catch {}
        }
        const now = new Date().toISOString().replace("T", " ").slice(0, 19);
        updateRun(this.db, run.id, { status: "cancelled", finished_at: now });
      }
    }

    // Stop web server
    if (this.webServer) {
      try { this.webServer.stop(); } catch {}
    }

    // Stop OpenCode server
    if (this.openCodeServer) {
      await this.openCodeServer.stop();
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
      } else if (run.tmux_session) {
        const result = Bun.spawnSync(["tmux", "has-session", "-t", run.tmux_session], {
          stdout: "pipe",
          stderr: "pipe",
        });
        alive = result.exitCode === 0;
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
