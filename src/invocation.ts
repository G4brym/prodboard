import * as path from "path";
import type { Config, Schedule, Run, EnvironmentInfo } from "./types.ts";
import { PRODBOARD_DIR } from "./config.ts";
import { getLastSessionId } from "./queries/runs.ts";
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

  const worktreeSupported = hasGit && config.daemon.useWorktrees !== "never";

  return { hasGit, hasClaude, worktreeSupported };
}

export function buildInvocation(
  schedule: Schedule,
  run: Run,
  config: Config,
  env: EnvironmentInfo,
  resolvedPrompt: string,
  db?: Database
): string[] {
  const args: string[] = ["claude"];

  // Prompt
  args.push("-p", resolvedPrompt);

  // Permissions
  args.push("--dangerously-skip-permissions");

  // Output format
  args.push("--output-format", "stream-json");

  // MCP config
  const mcpConfigPath = path.join(PRODBOARD_DIR, "mcp.json");
  args.push("--mcp-config", mcpConfigPath);

  // System prompt
  const systemPromptFile = env.hasGit
    ? path.join(PRODBOARD_DIR, "system-prompt.md")
    : path.join(PRODBOARD_DIR, "system-prompt-nogit.md");
  args.push("--append-system-prompt-file", systemPromptFile);

  // Max turns: min of schedule override, config default, and hard max
  const scheduleTurns = schedule.max_turns ?? config.daemon.maxTurns;
  const maxTurns = Math.min(scheduleTurns, config.daemon.hardMaxTurns);
  args.push("--max-turns", String(maxTurns));

  // Allowed tools
  let tools: string[];
  if (schedule.allowed_tools) {
    try {
      tools = JSON.parse(schedule.allowed_tools);
    } catch {
      tools = env.hasGit ? config.daemon.defaultAllowedTools : config.daemon.nonGitDefaultAllowedTools;
    }
  } else if (!env.hasGit) {
    tools = config.daemon.nonGitDefaultAllowedTools;
  } else {
    tools = config.daemon.defaultAllowedTools;
  }
  for (const tool of tools) {
    args.push("--allowedTools", tool);
  }

  // Worktree
  if (env.worktreeSupported && schedule.use_worktree !== 0) {
    args.push("--worktree");
  }

  // Session resume
  if (schedule.persist_session && db) {
    const lastSessionId = getLastSessionId(db, schedule.id);
    if (lastSessionId) {
      args.push("--resume", lastSessionId);
    }
  }

  // Agents JSON
  if (schedule.agents_json) {
    args.push("--agents", schedule.agents_json);
  }

  return args;
}
