import { Database } from "bun:sqlite";
import { ensureDb } from "../db.ts";
import { getIssueByPrefix } from "../queries/issues.ts";
import { createComment, listComments } from "../queries/comments.ts";
import { renderTable, formatDate, jsonOutput } from "../format.ts";

function parseArgs(args: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
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

export async function comment(args: string[], dbOverride?: Database): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const issueIdOrPrefix = positional[0];
  const body = positional.slice(1).join(" ");

  if (!issueIdOrPrefix || !body) {
    console.error("Usage: prodboard comment <issue-id> <body> [--author/-a author]");
    process.exit(1);
  }

  const db = dbOverride ?? ensureDb();
  const issue = getIssueByPrefix(db, issueIdOrPrefix);

  const author = (flags.author ?? flags.a) as string | undefined;
  const c = createComment(db, {
    issue_id: issue.id,
    body,
    author: typeof author === "string" ? author : undefined,
  });

  console.log(`Added comment by ${c.author} on issue ${issue.id}`);
}

export async function comments(args: string[], dbOverride?: Database): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const issueIdOrPrefix = positional[0];

  if (!issueIdOrPrefix) {
    console.error("Usage: prodboard comments <issue-id> [--json]");
    process.exit(1);
  }

  const db = dbOverride ?? ensureDb();
  const issue = getIssueByPrefix(db, issueIdOrPrefix);
  const cmts = listComments(db, issue.id);

  if (flags.json) {
    console.log(jsonOutput(cmts));
    return;
  }

  if (cmts.length === 0) {
    console.log("No comments.");
    return;
  }

  const table = renderTable(
    ["Author", "Date", "Comment"],
    cmts.map((c) => [c.author, formatDate(c.created_at), c.body]),
    { maxWidths: [12, 18, 60] }
  );
  console.log(table);
}
