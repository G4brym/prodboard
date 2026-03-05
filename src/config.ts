import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import type { Config } from "./types.ts";

export const PRODBOARD_DIR = path.join(os.homedir(), ".prodboard");

export function stripJsoncComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  let stringChar = "";

  while (i < text.length) {
    // Handle string literals
    if (inString) {
      if (text[i] === "\\" && i + 1 < text.length) {
        result += text[i] + text[i + 1];
        i += 2;
        continue;
      }
      if (text[i] === stringChar) {
        inString = false;
      }
      result += text[i];
      i++;
      continue;
    }

    // Check for string start
    if (text[i] === '"') {
      inString = true;
      stringChar = text[i];
      result += text[i];
      i++;
      continue;
    }

    // Check for line comment
    if (text[i] === "/" && i + 1 < text.length && text[i + 1] === "/") {
      // Skip until end of line
      while (i < text.length && text[i] !== "\n") {
        i++;
      }
      continue;
    }

    // Check for block comment
    if (text[i] === "/" && i + 1 < text.length && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && i + 1 < text.length && text[i + 1] === "/")) {
        i++;
      }
      if (i < text.length) {
        i += 2; // skip */
      }
      continue;
    }

    result += text[i];
    i++;
  }

  return result;
}

export function getDefaults(): Config {
  return {
    general: {
      statuses: ["todo", "in-progress", "review", "done", "archived"],
      defaultStatus: "todo",
      idPrefix: "",
    },
    daemon: {
      agent: "claude",
      basePath: null,
      useTmux: true,
      opencode: {
        serverUrl: null,
        model: null,
        agent: null,
      },
      maxConcurrentRuns: 2,
      maxTurns: 50,
      hardMaxTurns: 200,
      runTimeoutSeconds: 1800,
      runRetentionDays: 30,
      logLevel: "info",
      logMaxSizeMb: 10,
      logMaxFiles: 5,
      defaultAllowedTools: [
        "Read", "Edit", "Write", "Glob", "Grep", "Bash",
        "mcp__prodboard__list_issues",
        "mcp__prodboard__get_issue",
        "mcp__prodboard__create_issue",
        "mcp__prodboard__update_issue",
        "mcp__prodboard__add_comment",
        "mcp__prodboard__board_summary",
        "mcp__prodboard__pick_next_issue",
        "mcp__prodboard__complete_issue",
      ],
      nonGitDefaultAllowedTools: [
        "Read", "Edit", "Write", "Glob", "Grep", "Bash",
        "mcp__prodboard__list_issues",
        "mcp__prodboard__get_issue",
        "mcp__prodboard__create_issue",
        "mcp__prodboard__update_issue",
        "mcp__prodboard__add_comment",
        "mcp__prodboard__board_summary",
        "mcp__prodboard__pick_next_issue",
        "mcp__prodboard__complete_issue",
      ],
      useWorktrees: "auto",
    },
    webui: {
      enabled: false,
      port: 3838,
      hostname: "127.0.0.1",
      password: null,
    },
  };
}

export function deepMerge(defaults: any, user: any): any {
  const result = { ...defaults };
  for (const key of Object.keys(user)) {
    if (
      user[key] !== null &&
      typeof user[key] === "object" &&
      !Array.isArray(user[key]) &&
      defaults[key] !== undefined &&
      typeof defaults[key] === "object" &&
      !Array.isArray(defaults[key])
    ) {
      result[key] = deepMerge(defaults[key], user[key]);
    } else {
      result[key] = user[key];
    }
  }
  return result;
}

export function loadConfig(configDir?: string): Config {
  const dir = configDir ?? PRODBOARD_DIR;
  const configPath = path.join(dir, "config.jsonc");
  const defaults = getDefaults();

  if (!fs.existsSync(configPath)) {
    return defaults;
  }

  let text: string;
  try {
    text = fs.readFileSync(configPath, "utf-8");
  } catch (err: any) {
    throw new Error(`Failed to read config file: ${err.message}`);
  }

  const stripped = stripJsoncComments(text);

  let parsed: any;
  try {
    parsed = JSON.parse(stripped);
  } catch (err: any) {
    throw new Error(`Invalid JSON in config file ${configPath}: ${err.message}`);
  }

  return deepMerge(defaults, parsed);
}
