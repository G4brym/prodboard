import type { AgentDriver, AgentRunContext, AgentResult, StreamEvent } from "./types.ts";

export class OpenCodeDriver implements AgentDriver {
  readonly name = "opencode";

  buildCommand(ctx: AgentRunContext): string[] {
    const { schedule, config, resolvedPrompt, workdir, db } = ctx;
    const args: string[] = ["opencode", "run", resolvedPrompt];

    args.push("--format", "json");
    args.push("--dir", workdir);

    const opencode = config.daemon.opencode;

    if (opencode.serverUrl) {
      args.push("--attach", opencode.serverUrl);
    }

    if (opencode.model) {
      args.push("--model", opencode.model);
    }

    if (opencode.agent) {
      args.push("--agent", opencode.agent);
    }

    if (schedule.persist_session && db) {
      const { getLastSessionId } = require("../queries/runs.ts");
      const lastSessionId = getLastSessionId(db, schedule.id);
      if (lastSessionId) {
        args.push("--session", lastSessionId, "--continue");
      }
    }

    return args;
  }

  parseEvent(line: string): StreamEvent | null {
    let text = line.trim();
    if (!text) return null;

    // Strip SSE data: prefix
    if (text.startsWith("data: ")) {
      text = text.slice(6);
    }

    try {
      return JSON.parse(text);
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
      // OpenCode session.updated events
      if (event.type === "session.updated" && event.session?.id) {
        session_id = event.session.id;
      }
      if (event.type === "session.updated" && event.session?.usage) {
        const usage = event.session.usage;
        if (usage.input_tokens) tokens_in = usage.input_tokens;
        if (usage.output_tokens) tokens_out = usage.output_tokens;
        if (usage.cost_usd) cost_usd = usage.cost_usd;
      }

      // OpenCode tool events
      if (event.type === "tool_use" && event.tool) {
        tools_used.add(event.tool);
        if (event.tool.startsWith("mcp__prodboard__") && event.tool_input?.id) {
          issues_touched.add(event.tool_input.id);
        }
        if (event.tool.startsWith("mcp__prodboard__") && event.tool_input?.issue_id) {
          issues_touched.add(event.tool_input.issue_id);
        }
      }

      // Also handle message.part.updated events with tool info
      if (event.type === "message.part.updated" && event.part?.type === "tool-invocation") {
        if (event.part.toolName) {
          tools_used.add(event.part.toolName);
        }
      }

      // Fallback top-level fields
      if (event.session_id) session_id = event.session_id;
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
