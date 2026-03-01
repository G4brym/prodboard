import { Database } from "bun:sqlite";
import { ensureDb } from "../db.ts";
import { loadConfig } from "../config.ts";
import {
  createIssue, getIssueByPrefix, listIssues, updateIssue,
  deleteIssue, validateStatus
} from "../queries/issues.ts";
import { listComments } from "../queries/comments.ts";
import { renderTable, formatDate, jsonOutput, bold, dim, cyan } from "../format.ts";

function parseArgs(args: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function getFlag(flags: Record<string, string | boolean>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const val = flags[k];
    if (val !== undefined && val !== true) return val as string;
  }
  return undefined;
}

function hasFlag(flags: Record<string, string | boolean>, ...keys: string[]): boolean {
  return keys.some((k) => flags[k] !== undefined);
}

// Collect repeatable flags like --status todo --status done
function parseArgsMulti(args: string[]): { flags: Record<string, (string | boolean)[]>; positional: string[] } {
  const flags: Record<string, (string | boolean)[]> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (!flags[key]) flags[key] = [];
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key].push(args[++i]);
      } else {
        flags[key].push(true);
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      if (!flags[key]) flags[key] = [];
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key].push(args[++i]);
      } else {
        flags[key].push(true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

export async function add(args: string[], dbOverride?: Database): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const title = positional.join(" ");
  if (!title) {
    console.error("Usage: prodboard add <title> [-d description] [-s status]");
    process.exit(1);
  }

  const db = dbOverride ?? ensureDb();
  const config = loadConfig();

  const status = getFlag(flags, "status", "s");
  if (status) validateStatus(status, config);

  const issue = createIssue(db, {
    title,
    description: getFlag(flags, "description", "d"),
    status,
  });

  console.log(`Created issue ${issue.id}: ${issue.title} [${issue.status}]`);
}

export async function ls(args: string[], dbOverride?: Database): Promise<void> {
  const { flags } = parseArgsMulti(args);
  const db = dbOverride ?? ensureDb();

  const statusFilters = [
    ...(flags.status?.filter((v): v is string => typeof v === "string") ?? []),
    ...(flags.s?.filter((v): v is string => typeof v === "string") ?? []),
  ];

  const search = (flags.search?.[0] ?? flags.q?.[0]) as string | undefined;
  const all = flags.all !== undefined || flags.a !== undefined;
  const sortFlag = flags.sort?.[0] as string | undefined;
  const asc = flags.asc !== undefined;
  const limitStr = (flags.limit?.[0] ?? flags.n?.[0]) as string | undefined;
  const isJson = flags.json !== undefined;

  const { issues, total } = listIssues(db, {
    status: statusFilters.length > 0 ? statusFilters : undefined,
    search: typeof search === "string" ? search : undefined,
    includeArchived: all,
    sort: typeof sortFlag === "string" ? sortFlag : undefined,
    order: asc ? "ASC" : undefined,
    limit: limitStr ? parseInt(limitStr, 10) : undefined,
  });

  if (isJson) {
    console.log(jsonOutput(issues));
    return;
  }

  if (issues.length === 0) {
    console.log("No issues found.");
    return;
  }

  const table = renderTable(
    ["ID", "Title", "Status", "Updated"],
    issues.map((i) => [i.id, i.title, i.status, formatDate(i.updated_at)]),
    { maxWidths: [10, 40, 15, 18] }
  );
  console.log(table);
  console.log(`${total} issue${total === 1 ? "" : "s"}`);
}

export async function show(args: string[], dbOverride?: Database): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const idOrPrefix = positional[0];
  if (!idOrPrefix) {
    console.error("Usage: prodboard show <id>");
    process.exit(1);
  }

  const db = dbOverride ?? ensureDb();
  const isJson = hasFlag(flags, "json");

  const issue = getIssueByPrefix(db, idOrPrefix);
  const comments = listComments(db, issue.id);

  if (isJson) {
    console.log(jsonOutput({ ...issue, comments }));
    return;
  }

  console.log(`Issue ${issue.id}`);
  console.log(`Title: ${issue.title}`);
  console.log(`Status: ${issue.status}`);
  console.log(`Created: ${formatDate(issue.created_at)}`);
  console.log(`Updated: ${formatDate(issue.updated_at)}`);

  if (issue.description) {
    console.log(`\nDescription:\n${issue.description}`);
  }

  if (comments.length > 0) {
    console.log(`\nComments (${comments.length}):`);
    for (const c of comments) {
      console.log(`  [${c.author}] ${formatDate(c.created_at)}`);
      console.log(`  ${c.body}`);
      console.log();
    }
  }
}

export async function edit(args: string[], dbOverride?: Database): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const idOrPrefix = positional[0];
  if (!idOrPrefix) {
    console.error("Usage: prodboard edit <id> [--title/-t title] [--description/-d desc] [--status/-s status]");
    process.exit(1);
  }

  const db = dbOverride ?? ensureDb();
  const config = loadConfig();
  const issue = getIssueByPrefix(db, idOrPrefix);

  const fields: { title?: string; description?: string; status?: string } = {};
  const title = getFlag(flags, "title", "t");
  const description = getFlag(flags, "description", "d");
  const status = getFlag(flags, "status", "s");

  if (title) fields.title = title;
  if (description) fields.description = description;
  if (status) {
    validateStatus(status, config);
    fields.status = status;
  }

  if (Object.keys(fields).length === 0) {
    console.error("No fields to update. Use --title, --description, or --status.");
    process.exit(1);
  }

  const updated = updateIssue(db, issue.id, fields);
  console.log(`Updated issue ${updated.id}: ${updated.title} [${updated.status}]`);
}

export async function mv(args: string[], dbOverride?: Database): Promise<void> {
  const { positional } = parseArgs(args);
  const idOrPrefix = positional[0];
  const newStatus = positional[1];

  if (!idOrPrefix || !newStatus) {
    console.error("Usage: prodboard mv <id> <status>");
    process.exit(1);
  }

  const db = dbOverride ?? ensureDb();
  const config = loadConfig();
  validateStatus(newStatus, config);

  const issue = getIssueByPrefix(db, idOrPrefix);
  const updated = updateIssue(db, issue.id, { status: newStatus });
  console.log(`Moved issue ${updated.id} to ${updated.status}`);
}

export async function rm(args: string[], dbOverride?: Database): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const idOrPrefix = positional[0];
  if (!idOrPrefix) {
    console.error("Usage: prodboard rm <id> [--force/-f]");
    process.exit(1);
  }

  const db = dbOverride ?? ensureDb();
  const issue = getIssueByPrefix(db, idOrPrefix);

  if (!hasFlag(flags, "force", "f")) {
    console.log(`Delete issue ${issue.id}: ${issue.title}? (use --force to skip confirmation)`);
    return;
  }

  deleteIssue(db, issue.id);
  console.log(`Deleted issue ${issue.id}`);
}
