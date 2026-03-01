import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "./helpers.ts";
import { resolveTemplate, buildBoardSummaryLine } from "../src/templates.ts";
import { createIssue } from "../src/queries/issues.ts";
import type { TemplateContext } from "../src/templates.ts";

let db: Database;

function makeContext(overrides?: Partial<TemplateContext>): TemplateContext {
  return {
    boardSummary: "3 todo, 1 in-progress, 0 review, 2 done",
    todoCount: 3,
    inProgressCount: 1,
    datetime: "2026-03-01T12:00:00.000Z",
    scheduleName: "daily-check",
    ...overrides,
  };
}

beforeEach(() => {
  db = createTestDb();
});

describe("Template Engine", () => {
  test("{{board_summary}} resolves to compact summary", () => {
    const result = resolveTemplate("Board: {{board_summary}}", makeContext());
    expect(result).toBe("Board: 3 todo, 1 in-progress, 0 review, 2 done");
  });

  test("{{todo_count}} resolves to number", () => {
    const result = resolveTemplate("Todos: {{todo_count}}", makeContext());
    expect(result).toBe("Todos: 3");
  });

  test("{{in_progress_count}} resolves to number", () => {
    const result = resolveTemplate("In progress: {{in_progress_count}}", makeContext());
    expect(result).toBe("In progress: 1");
  });

  test("{{datetime}} resolves to ISO 8601 string", () => {
    const result = resolveTemplate("Time: {{datetime}}", makeContext());
    expect(result).toBe("Time: 2026-03-01T12:00:00.000Z");
  });

  test("{{schedule_name}} resolves to schedule name", () => {
    const result = resolveTemplate("Schedule: {{schedule_name}}", makeContext());
    expect(result).toBe("Schedule: daily-check");
  });

  test("unknown {{variables}} are left as-is", () => {
    const result = resolveTemplate("{{unknown_var}}", makeContext());
    expect(result).toBe("{{unknown_var}}");
  });

  test("multiple variables in same template all resolve", () => {
    const result = resolveTemplate(
      "{{schedule_name}}: {{todo_count}} todos at {{datetime}}",
      makeContext()
    );
    expect(result).toContain("daily-check");
    expect(result).toContain("3");
    expect(result).toContain("2026-03-01");
  });
});

describe("buildBoardSummaryLine", () => {
  test("builds correct summary from DB", () => {
    createIssue(db, { title: "A", status: "todo" });
    createIssue(db, { title: "B", status: "todo" });
    createIssue(db, { title: "C", status: "in-progress" });
    createIssue(db, { title: "D", status: "done" });

    const summary = buildBoardSummaryLine(db);
    expect(summary).toContain("2 todo");
    expect(summary).toContain("1 in-progress");
    expect(summary).toContain("0 review");
    expect(summary).toContain("1 done");
  });

  test("empty board shows all zeros", () => {
    const summary = buildBoardSummaryLine(db);
    expect(summary).toContain("0 todo");
    expect(summary).toContain("0 in-progress");
  });
});
