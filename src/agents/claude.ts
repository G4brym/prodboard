import * as path from "path";
import { PRODBOARD_DIR } from "../config.ts";
import { getLastSessionId } from "../queries/runs.ts";
import type { AgentDriver, AgentRunContext, AgentResult, StreamEvent } from "./types.ts";

export class ClaudeDriver implements AgentDriver {
  readonly name = "claude";

  buildCommand(ctx: AgentRunContext): string[] {
    const { schedule, config, env, resolvedPrompt, db } = ctx;
    const args: string[] = ["claude"];

    args.push("-p", resolvedPrompt);
    args.push("--dangerously-skip-permissions");
    args.push("--verbose", "--output-format", "stream-json");

    const mcpConfigPath = path.join(PRODBOARD_DIR, "mcp.json");
    args.push("--mcp-config", mcpConfigPath);

    const systemPromptFile = env.hasGit
      ? path.join(PRODBOARD_DIR, "system-prompt.md")
      : path.join(PRODBOARD_DIR, "system-prompt-nogit.md");
    args.push("--append-system-prompt-file", systemPromptFile);

    const scheduleTurns = schedule.max_turns ?? config.daemon.maxTurns;
    const maxTurns = Math.min(scheduleTurns, config.daemon.hardMaxTurns);
    args.push("--max-turns", String(maxTurns));

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

    if (schedule.persist_session && db) {
      const lastSessionId = getLastSessionId(db, schedule.id);
      if (lastSessionId) {
        args.push("--resume", lastSessionId);
      }
    }

    if (schedule.agents_json) {
      args.push("--agents", schedule.agents_json);
    }

    return args;
  }

  parseEvent(line: string): StreamEvent | null {
    try {
      return JSON.parse(line.trim());
    } catch {
      return null;
    }
  }

  extractResult(events: StreamEvent[]): AgentResult {
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
}
