import type { Config } from "../types.ts";
import type { AgentDriver } from "./types.ts";
import { ClaudeDriver } from "./claude.ts";
import { OpenCodeDriver } from "./opencode.ts";

export function createAgentDriver(config: Config): AgentDriver {
  switch (config.daemon.agent) {
    case "opencode":
      return new OpenCodeDriver();
    case "claude":
    default:
      return new ClaudeDriver();
  }
}

export type { AgentDriver, AgentRunContext, AgentResult, StreamEvent } from "./types.ts";
export { ClaudeDriver } from "./claude.ts";
export { OpenCodeDriver } from "./opencode.ts";
