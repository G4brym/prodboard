import type { Database } from "bun:sqlite";
import type { Config, Schedule, Run, EnvironmentInfo } from "../types.ts";

export interface AgentResult {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  session_id: string | null;
  tools_used: string[];
  issues_touched: string[];
}

export interface AgentRunContext {
  schedule: Schedule;
  run: Run;
  config: Config;
  env: EnvironmentInfo;
  resolvedPrompt: string;
  workdir: string;
  db: Database;
}

export interface StreamEvent {
  type: string;
  session_id?: string;
  tool?: string;
  tool_input?: any;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  [key: string]: any;
}

export interface AgentDriver {
  readonly name: string;
  buildCommand(ctx: AgentRunContext): string[];
  parseEvent(line: string): StreamEvent | null;
  extractResult(events: StreamEvent[]): AgentResult;
}
