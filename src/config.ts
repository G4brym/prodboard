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

export function loadConfigRaw(configDir?: string): { config: Config; rawParsed: any } {
  const dir = configDir ?? PRODBOARD_DIR;
  const configPath = path.join(dir, "config.jsonc");
  const defaults = getDefaults();

  if (!fs.existsSync(configPath)) {
    return { config: defaults, rawParsed: {} };
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

  return { config: deepMerge(defaults, parsed), rawParsed: parsed };
}

export function loadConfig(configDir?: string): Config {
  return loadConfigRaw(configDir).config;
}

export function validateConfig(rawParsed: any): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof rawParsed !== "object" || rawParsed === null) {
    errors.push("Config must be a JSON object.");
    return { errors, warnings };
  }

  const knownTopLevel = ["general", "daemon", "webui"];
  for (const key of Object.keys(rawParsed)) {
    if (!knownTopLevel.includes(key)) {
      warnings.push(`Unknown top-level key "${key}". Known keys: ${knownTopLevel.join(", ")}`);
    }
  }

  const g = rawParsed.general;
  if (g !== undefined) {
    if (g.statuses !== undefined && (!Array.isArray(g.statuses) || !g.statuses.every((s: any) => typeof s === "string"))) {
      warnings.push("general.statuses must be an array of strings.");
    }
    if (g.defaultStatus !== undefined && typeof g.defaultStatus !== "string") {
      warnings.push(`general.defaultStatus must be a string, got ${typeof g.defaultStatus}.`);
    }
  }

  const d = rawParsed.daemon;
  if (d !== undefined) {
    if (d.agent !== undefined && d.agent !== "claude" && d.agent !== "opencode") {
      warnings.push(`daemon.agent must be "claude" or "opencode", got "${d.agent}".`);
    }
    if (d.useWorktrees !== undefined && !["auto", "always", "never"].includes(d.useWorktrees)) {
      warnings.push(`daemon.useWorktrees must be "auto", "always", or "never", got "${d.useWorktrees}".`);
    }
    if (d.useTmux !== undefined && typeof d.useTmux !== "boolean") {
      warnings.push(`daemon.useTmux must be a boolean, got ${typeof d.useTmux}.`);
    }
    for (const numField of ["maxConcurrentRuns", "maxTurns", "hardMaxTurns", "runTimeoutSeconds", "runRetentionDays"]) {
      if (d[numField] !== undefined && typeof d[numField] !== "number") {
        warnings.push(`daemon.${numField} must be a number, got ${typeof d[numField]}.`);
      }
    }
  }

  const w = rawParsed.webui;
  if (w !== undefined) {
    if (w.enabled !== undefined && typeof w.enabled !== "boolean") {
      warnings.push(`webui.enabled must be a boolean, got ${typeof w.enabled}.`);
    }
    if (w.port !== undefined && (typeof w.port !== "number" || w.port < 1 || w.port > 65535)) {
      warnings.push(`webui.port must be a number between 1 and 65535, got ${JSON.stringify(w.port)}.`);
    }
    if (w.hostname !== undefined && typeof w.hostname !== "string") {
      warnings.push(`webui.hostname must be a string, got ${typeof w.hostname}.`);
    }
    if (w.password !== undefined && w.password !== null && typeof w.password !== "string") {
      warnings.push(`webui.password must be a string or null, got ${typeof w.password}.`);
    }
  }

  return { errors, warnings };
}

export async function checkWebuiDependencies(): Promise<string[]> {
  const warnings: string[] = [];
  try {
    await import("hono");
  } catch {
    warnings.push("webui is enabled but 'hono' is not installed. Run: bun install");
  }
  try {
    await import("hono/jsx/jsx-runtime");
  } catch {
    warnings.push(
      "webui is enabled but the Hono JSX runtime could not be loaded. " +
      "If prodboard is installed globally, you may need to install hono in the global package directory."
    );
  }
  return warnings;
}
