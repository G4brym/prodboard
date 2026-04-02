import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb, createTestConfig } from "./helpers.ts";
import {
  handleListIssues, handleGetIssue, handleCreateIssue, handleUpdateIssue,
  handleDeleteIssue, handleAddComment, handleBoardSummary, handlePickNextIssue,
  handleCompleteIssue,
} from "../src/mcp.ts";
import { createIssue } from "../src/queries/issues.ts";
import { createComment } from "../src/queries/comments.ts";

let db: Database;
const config = createTestConfig();

beforeEach(() => {
  db = createTestDb();
});

describe("MCP Tool Handlers", () => {
  describe("list_issues", () => {
    test("returns correct shape with total", () => {
      createIssue(db, { title: "Test" });
      const result = handleListIssues(db, {});
      expect(result.total).toBe(1);
      expect(result.issues.length).toBe(1);
      expect(result.issues[0].id).toBeTruthy();
      expect(result.issues[0].title).toBe("Test");
      expect(result.issues[0].status).toBe("todo");
      expect(result.issues[0].comment_count).toBe(0);
      expect(result.issues[0].updated_at).toBeTruthy();
      // Should NOT have description
      expect((result.issues[0] as any).description).toBeUndefined();
    });

    test("total reflects full count when limit applies", () => {
      for (let i = 0; i < 5; i++) createIssue(db, { title: `Issue ${i}` });
      const result = handleListIssues(db, { limit: 2 });
      expect(result.issues.length).toBe(2);
      expect(result.total).toBe(5);
    });

    test("sort and order params are respected", () => {
      createIssue(db, { title: "Alpha" });
      createIssue(db, { title: "Beta" });
      const asc = handleListIssues(db, { sort: "title", order: "ASC" });
      expect(asc.issues[0].title).toBe("Alpha");
      const desc = handleListIssues(db, { sort: "title", order: "DESC" });
      expect(desc.issues[0].title).toBe("Beta");
    });

    test("filters by status", () => {
      createIssue(db, { title: "Todo issue", status: "todo" });
      createIssue(db, { title: "Done issue", status: "done" });
      const result = handleListIssues(db, { status: ["todo"] });
      expect(result.total).toBe(1);
      expect(result.issues[0].title).toBe("Todo issue");
    });
  });

  describe("get_issue", () => {
    test("returns full issue with comments", () => {
      const issue = createIssue(db, { title: "Test", description: "A desc" });
      createComment(db, { issue_id: issue.id, body: "Hello" });
      const result = handleGetIssue(db, { id: issue.id });
      expect(result.title).toBe("Test");
      expect(result.description).toBe("A desc");
      expect(result.comments.length).toBe(1);
    });

    test("works with prefix ID", () => {
      const issue = createIssue(db, { title: "Prefix" });
      const result = handleGetIssue(db, { id: issue.id.slice(0, 4) });
      expect(result.title).toBe("Prefix");
    });

    test("non-existent ID throws", () => {
      expect(() => handleGetIssue(db, { id: "nonexist" })).toThrow("not found");
    });
  });

  describe("create_issue", () => {
    test("creates and returns issue", () => {
      const result = handleCreateIssue(db, config, { title: "New issue" });
      expect(result.id).toBeTruthy();
      expect(result.title).toBe("New issue");
      expect(result.status).toBe("todo");
    });

    test("invalid status returns error with valid_statuses", () => {
      expect(() => handleCreateIssue(db, config, { title: "Bad", status: "invalid" })).toThrow("Invalid status");
    });
  });

  describe("update_issue", () => {
    test("updates specified fields only", () => {
      const issue = createIssue(db, { title: "Original", description: "Desc" });
      const result = handleUpdateIssue(db, config, { id: issue.id, title: "Changed" });
      expect(result.title).toBe("Changed");
      expect(result.description).toBe("Desc");
    });
  });

  describe("delete_issue", () => {
    test("removes issue and comments", () => {
      const issue = createIssue(db, { title: "Delete me" });
      createComment(db, { issue_id: issue.id, body: "bye" });
      const result = handleDeleteIssue(db, { id: issue.id });
      expect(result.deleted).toBe(true);
      expect(() => handleGetIssue(db, { id: issue.id })).toThrow();
    });
  });

  describe("add_comment", () => {
    test("creates comment with default author 'claude'", () => {
      const issue = createIssue(db, { title: "Test" });
      const result = handleAddComment(db, { issue_id: issue.id, body: "Hello" });
      expect(result.author).toBe("claude");
      expect(result.body).toBe("Hello");
    });
  });

  describe("board_summary", () => {
    test("returns counts, recent issues, statuses", () => {
      createIssue(db, { title: "A", status: "todo" });
      createIssue(db, { title: "B", status: "done" });
      const result = handleBoardSummary(db);
      expect(result.counts.todo).toBe(1);
      expect(result.counts.done).toBe(1);
      expect(result.total_issues).toBe(2);
      expect(result.recent_issues.length).toBe(2);
    });
  });

  describe("pick_next_issue", () => {
    test("returns oldest todo, moves to in-progress, adds comment", () => {
      const first = createIssue(db, { title: "First" });
      createIssue(db, { title: "Second" });
      const result = handlePickNextIssue(db, config, {}) as any;
      expect(result.id).toBe(first.id);
      expect(result.status).toBe("in-progress");
      expect(result.comments.length).toBe(1);
      expect(result.comments[0].body).toBe("Work started");
    });

    test("with no todos returns null with message", () => {
      const result = handlePickNextIssue(db, config, {});
      expect(result.picked).toBeNull();
      expect(result.message).toBeTruthy();
    });
  });

  describe("complete_issue", () => {
    test("sets status=done, adds completion comment", () => {
      const issue = createIssue(db, { title: "Complete me", status: "in-progress" });
      const result = handleCompleteIssue(db, config, { id: issue.id, comment: "All done!" });
      expect(result.status).toBe("done");
      expect(result.comments.some((c: any) => c.body === "All done!")).toBe(true);
    });

    test("without comment still works", () => {
      const issue = createIssue(db, { title: "Complete me" });
      const result = handleCompleteIssue(db, config, { id: issue.id });
      expect(result.status).toBe("done");
    });
  });
});
