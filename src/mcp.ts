import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Database } from "bun:sqlite";
import { ensureDb } from "./db.ts";
import { loadConfig } from "./config.ts";
import {
  createIssue, getIssueByPrefix, listIssues, updateIssue,
  deleteIssue, getIssueCounts, validateStatus, resolveIssueId,
} from "./queries/issues.ts";
import { createComment, listComments, getCommentCount } from "./queries/comments.ts";
import type { Config } from "./types.ts";

// Lazy-load schedule/run queries (they may not exist yet during early phases)
// undefined = not tried, null = failed permanently, object = loaded
let scheduleQueries: any = undefined;
let runQueries: any = undefined;

async function getScheduleQueries() {
  if (scheduleQueries === undefined) {
    try {
      scheduleQueries = await import("./queries/schedules.ts");
    } catch {
      scheduleQueries = null;
    }
  }
  return scheduleQueries;
}

async function getRunQueries() {
  if (runQueries === undefined) {
    try {
      runQueries = await import("./queries/runs.ts");
    } catch {
      runQueries = null;
    }
  }
  return runQueries;
}

const TOOLS = [
  {
    name: "list_issues",
    description: "List issues with optional filters. Returns id, title, status, comment_count, updated_at (no description for compact output).",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "array" as const, items: { type: "string" as const }, description: "Filter by status(es)" },
        search: { type: "string" as const, description: "Search title and description" },
        include_archived: { type: "boolean" as const, description: "Include archived issues" },
        limit: { type: "number" as const, description: "Max issues to return (default 50)" },
      },
    },
  },
  {
    name: "get_issue",
    description: "Get full issue details including description and all comments. Accepts full ID or unique prefix.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const, description: "Issue ID or unique prefix" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_issue",
    description: "Create a new issue.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string" as const, description: "Issue title" },
        description: { type: "string" as const, description: "Issue description" },
        status: { type: "string" as const, description: "Initial status (default: todo)" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_issue",
    description: "Update an existing issue's fields.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const, description: "Issue ID or unique prefix" },
        title: { type: "string" as const, description: "New title" },
        description: { type: "string" as const, description: "New description" },
        status: { type: "string" as const, description: "New status" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_issue",
    description: "Delete an issue and all its comments.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const, description: "Issue ID or unique prefix" },
      },
      required: ["id"],
    },
  },
  {
    name: "add_comment",
    description: "Add a comment to an issue.",
    inputSchema: {
      type: "object" as const,
      properties: {
        issue_id: { type: "string" as const, description: "Issue ID or unique prefix" },
        body: { type: "string" as const, description: "Comment text" },
        author: { type: "string" as const, description: "Comment author (default: claude)" },
      },
      required: ["issue_id", "body"],
    },
  },
  {
    name: "board_summary",
    description: "Get a summary of the board: issue counts by status, recent issues, active schedules.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "pick_next_issue",
    description: "Pick the next available issue to work on. Moves it to in-progress and adds a 'Work started' comment.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string" as const, description: "Status to pick from (default: todo)" },
      },
    },
  },
  {
    name: "complete_issue",
    description: "Mark an issue as done and optionally add a completion comment.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const, description: "Issue ID or unique prefix" },
        comment: { type: "string" as const, description: "Optional completion comment" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_schedules",
    description: "List scheduled tasks with their status and last run info.",
    inputSchema: {
      type: "object" as const,
      properties: {
        include_disabled: { type: "boolean" as const, description: "Include disabled schedules" },
      },
    },
  },
  {
    name: "create_schedule",
    description: "Create a new scheduled task.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const, description: "Schedule name" },
        cron: { type: "string" as const, description: "Cron expression (5 fields)" },
        prompt: { type: "string" as const, description: "Prompt to send to Claude" },
        workdir: { type: "string" as const, description: "Working directory" },
        max_turns: { type: "number" as const, description: "Max turns per run" },
      },
      required: ["name", "cron", "prompt"],
    },
  },
  {
    name: "update_schedule",
    description: "Update a scheduled task.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const, description: "Schedule ID or prefix" },
        name: { type: "string" as const },
        cron: { type: "string" as const },
        prompt: { type: "string" as const },
        enabled: { type: "boolean" as const },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_schedule",
    description: "Delete a scheduled task and its run history.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const, description: "Schedule ID or prefix" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_runs",
    description: "List run history for schedules.",
    inputSchema: {
      type: "object" as const,
      properties: {
        schedule_id: { type: "string" as const, description: "Filter by schedule ID" },
        status: { type: "string" as const, description: "Filter by run status" },
        limit: { type: "number" as const, description: "Max runs to return" },
      },
    },
  },
];

const RESOURCES = [
  {
    uri: "prodboard://issues",
    name: "Board Summary",
    description: "Current issue board summary with counts and recent issues",
    mimeType: "application/json",
  },
  {
    uri: "prodboard://schedules",
    name: "Active Schedules",
    description: "Active scheduled tasks with next run times",
    mimeType: "application/json",
  },
];

// Handler functions
export function handleListIssues(db: Database, params: any) {
  const { issues } = listIssues(db, {
    status: params.status,
    search: params.search,
    includeArchived: params.include_archived,
    limit: params.limit,
  });

  return issues.map((i) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    comment_count: getCommentCount(db, i.id),
    updated_at: i.updated_at,
  }));
}

export function handleGetIssue(db: Database, params: any) {
  const issue = getIssueByPrefix(db, params.id);
  const comments = listComments(db, issue.id);
  return { ...issue, comments };
}

export function handleCreateIssue(db: Database, config: Config, params: any) {
  if (params.status) validateStatus(params.status, config);
  return createIssue(db, {
    title: params.title,
    description: params.description,
    status: params.status,
  });
}

export function handleUpdateIssue(db: Database, config: Config, params: any) {
  const id = resolveIssueId(db, params.id);
  const fields: any = {};
  if (params.title !== undefined) fields.title = params.title;
  if (params.description !== undefined) fields.description = params.description;
  if (params.status !== undefined) {
    validateStatus(params.status, config);
    fields.status = params.status;
  }
  return updateIssue(db, id, fields);
}

export function handleDeleteIssue(db: Database, params: any) {
  const id = resolveIssueId(db, params.id);
  deleteIssue(db, id);
  return { deleted: true, id };
}

export function handleAddComment(db: Database, params: any) {
  const id = resolveIssueId(db, params.issue_id);
  return createComment(db, {
    issue_id: id,
    body: params.body,
    author: params.author ?? "claude",
  });
}

export function handleBoardSummary(db: Database) {
  const counts = getIssueCounts(db);
  const { issues: recent } = listIssues(db, { limit: 5 });
  const recentCompact = recent.map((i) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    updated_at: i.updated_at,
  }));

  return {
    counts,
    statuses: Object.keys(counts),
    recent_issues: recentCompact,
    total_issues: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}

export function handlePickNextIssue(db: Database, config: Config, params: any) {
  const status = params?.status ?? "todo";
  const { issues } = listIssues(db, {
    status: [status],
    sort: "created_at",
    order: "ASC",
    limit: 1,
  });

  if (issues.length === 0) {
    return { picked: null, message: `No issues with status '${status}' found.` };
  }

  const issue = issues[0];
  validateStatus("in-progress", config);
  updateIssue(db, issue.id, { status: "in-progress" });
  createComment(db, {
    issue_id: issue.id,
    body: "Work started",
    author: "claude",
  });

  const updated = getIssueByPrefix(db, issue.id);
  const comments = listComments(db, issue.id);
  return { ...updated, comments };
}

export function handleCompleteIssue(db: Database, config: Config, params: any) {
  const id = resolveIssueId(db, params.id);
  validateStatus("done", config);
  updateIssue(db, id, { status: "done" });

  if (params.comment) {
    createComment(db, {
      issue_id: id,
      body: params.comment,
      author: "claude",
    });
  }

  const updated = getIssueByPrefix(db, id);
  const comments = listComments(db, id);
  return { ...updated, comments };
}

export async function handleListSchedules(db: Database, params: any) {
  const sq = await getScheduleQueries();
  const rq = await getRunQueries();
  if (!sq) return [];

  const schedules = sq.listSchedules(db, {
    includeDisabled: params?.include_disabled,
  });

  const result = [];
  for (const s of schedules) {
    let lastRun = null;
    if (rq) {
      lastRun = rq.getLastRun(db, s.id);
    }
    result.push({
      ...s,
      last_run: lastRun ? { status: lastRun.status, finished_at: lastRun.finished_at } : null,
    });
  }
  return result;
}

export async function handleCreateSchedule(db: Database, params: any) {
  const sq = await getScheduleQueries();
  if (!sq) throw new Error("Schedule module not available");

  const { validateCron } = await import("./cron.ts");
  const validation = validateCron(params.cron);
  if (!validation.valid) {
    throw new Error(`Invalid cron expression: ${validation.error}`);
  }

  return sq.createSchedule(db, {
    name: params.name,
    cron: params.cron,
    prompt: params.prompt,
    workdir: params.workdir,
    max_turns: params.max_turns,
    source: "mcp",
  });
}

export async function handleUpdateSchedule(db: Database, params: any) {
  const sq = await getScheduleQueries();
  if (!sq) throw new Error("Schedule module not available");

  const schedule = sq.getScheduleByPrefix(db, params.id);
  const fields: any = {};
  if (params.name !== undefined) fields.name = params.name;
  if (params.cron !== undefined) {
    const { validateCron } = await import("./cron.ts");
    const validation = validateCron(params.cron);
    if (!validation.valid) throw new Error(`Invalid cron expression: ${validation.error}`);
    fields.cron = params.cron;
  }
  if (params.prompt !== undefined) fields.prompt = params.prompt;
  if (params.enabled !== undefined) fields.enabled = params.enabled ? 1 : 0;

  return sq.updateSchedule(db, schedule.id, fields);
}

export async function handleDeleteSchedule(db: Database, params: any) {
  const sq = await getScheduleQueries();
  if (!sq) throw new Error("Schedule module not available");

  const schedule = sq.getScheduleByPrefix(db, params.id);
  sq.deleteSchedule(db, schedule.id);
  return { deleted: true, id: schedule.id };
}

export async function handleListRuns(db: Database, params: any) {
  const rq = await getRunQueries();
  if (!rq) return [];

  return rq.listRuns(db, {
    schedule_id: params?.schedule_id,
    status: params?.status,
    limit: params?.limit,
  });
}

export async function startMcpServer(): Promise<void> {
  const db = ensureDb();
  const config = loadConfig();
  const pkg = await import("../package.json");

  const server = new Server(
    { name: "prodboard", version: pkg.version },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: params } = request.params;
    try {
      let result: any;
      switch (name) {
        case "list_issues":
          result = handleListIssues(db, params ?? {});
          break;
        case "get_issue":
          result = handleGetIssue(db, params ?? {});
          break;
        case "create_issue":
          result = handleCreateIssue(db, config, params ?? {});
          break;
        case "update_issue":
          result = handleUpdateIssue(db, config, params ?? {});
          break;
        case "delete_issue":
          result = handleDeleteIssue(db, params ?? {});
          break;
        case "add_comment":
          result = handleAddComment(db, params ?? {});
          break;
        case "board_summary":
          result = handleBoardSummary(db);
          break;
        case "pick_next_issue":
          result = handlePickNextIssue(db, config, params ?? {});
          break;
        case "complete_issue":
          result = handleCompleteIssue(db, config, params ?? {});
          break;
        case "list_schedules":
          result = await handleListSchedules(db, params ?? {});
          break;
        case "create_schedule":
          result = await handleCreateSchedule(db, params ?? {});
          break;
        case "update_schedule":
          result = await handleUpdateSchedule(db, params ?? {});
          break;
        case "delete_schedule":
          result = await handleDeleteSchedule(db, params ?? {});
          break;
        case "list_runs":
          result = await handleListRuns(db, params ?? {});
          break;
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri === "prodboard://issues") {
      const summary = handleBoardSummary(db);
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify(summary, null, 2),
        }],
      };
    }
    if (uri === "prodboard://schedules") {
      const schedules = await handleListSchedules(db, {});
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify(schedules, null, 2),
        }],
      };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
