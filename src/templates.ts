import { Database } from "bun:sqlite";
import { getIssueCounts } from "./queries/issues.ts";

export interface TemplateContext {
  boardSummary: string;
  todoCount: number;
  inProgressCount: number;
  datetime: string;
  scheduleName: string;
}

export function resolveTemplate(template: string, context: TemplateContext): string {
  return template
    .replace(/\{\{board_summary\}\}/g, context.boardSummary)
    .replace(/\{\{todo_count\}\}/g, String(context.todoCount))
    .replace(/\{\{in_progress_count\}\}/g, String(context.inProgressCount))
    .replace(/\{\{datetime\}\}/g, context.datetime)
    .replace(/\{\{schedule_name\}\}/g, context.scheduleName);
}

export function buildBoardSummaryLine(db: Database): string {
  const counts = getIssueCounts(db);
  const parts: string[] = [];

  const statuses = ["todo", "in-progress", "review", "done"];
  for (const status of statuses) {
    const count = counts[status] ?? 0;
    parts.push(`${count} ${status}`);
  }

  return parts.join(", ");
}

export function buildTemplateContext(db: Database, scheduleName: string): TemplateContext {
  const counts = getIssueCounts(db);
  return {
    boardSummary: buildBoardSummaryLine(db),
    todoCount: counts.todo ?? 0,
    inProgressCount: counts["in-progress"] ?? 0,
    datetime: new Date().toISOString(),
    scheduleName,
  };
}
