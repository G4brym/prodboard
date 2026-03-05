import type { Config, Schedule, Run, EnvironmentInfo } from "./types.ts";
import { ClaudeDriver } from "./agents/claude.ts";
import { Database } from "bun:sqlite";

export function detectEnvironment(workdir: string, config: Config): EnvironmentInfo {
  let hasGit = false;
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "--git-dir"], {
      cwd: workdir,
      stdout: "pipe",
      stderr: "pipe",
    });
    hasGit = result.exitCode === 0;
  } catch {}

  let hasClaude = false;
  try {
    const result = Bun.spawnSync(["claude", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    hasClaude = result.exitCode === 0;
  } catch {}

  let hasOpencode = false;
  try {
    const result = Bun.spawnSync(["opencode", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    hasOpencode = result.exitCode === 0;
  } catch {}

  const worktreeSupported = hasGit && config.daemon.useWorktrees !== "never";

  return { hasGit, hasClaude, hasOpencode, worktreeSupported };
}

export function buildInvocation(
  schedule: Schedule,
  run: Run,
  config: Config,
  env: EnvironmentInfo,
  resolvedPrompt: string,
  db?: Database
): string[] {
  const driver = new ClaudeDriver();
  return driver.buildCommand({ schedule, run, config, env, resolvedPrompt, workdir: schedule.workdir, db: db! });
}
