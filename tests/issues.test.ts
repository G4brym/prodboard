import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb, createTestConfig } from "./helpers.ts";
import {
  createIssue, getIssue, getIssueByPrefix, listIssues,
  updateIssue, deleteIssue, getIssueCounts, validateStatus
} from "../src/queries/issues.ts";
import { createComment } from "../src/queries/comments.ts";

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe("Issue Queries", () => {
  test("create issue with defaults", () => {
    const issue = createIssue(db, { title: "Test issue" });
    expect(issue.id).toMatch(/^[0-9a-f]{16}$/);
    expect(issue.title).toBe("Test issue");
    expect(issue.status).toBe("todo");
    expect(issue.description).toBe("");
    expect(issue.created_at).toBeTruthy();
    expect(issue.updated_at).toBeTruthy();
  });

  test("create issue with explicit status", () => {
    const issue = createIssue(db, { title: "Test", status: "in-progress" });
    expect(issue.status).toBe("in-progress");
  });

  test("get issue by full ID", () => {
    const created = createIssue(db, { title: "Find me" });
    const found = getIssue(db, created.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Find me");
  });

  test("get issue by prefix (unique match)", () => {
    const created = createIssue(db, { title: "Prefix test" });
    const prefix = created.id.slice(0, 4);
    const found = getIssueByPrefix(db, prefix);
    expect(found.id).toBe(created.id);
  });

  test("prefix with no matches throws 'not found'", () => {
    expect(() => getIssueByPrefix(db, "zzzzzzzz")).toThrow("not found");
  });

  test("list issues returns all non-archived by default", () => {
    createIssue(db, { title: "A", status: "todo" });
    createIssue(db, { title: "B", status: "done" });
    createIssue(db, { title: "C", status: "archived" });
    const { issues, total } = listIssues(db);
    expect(issues.length).toBe(2);
    expect(total).toBe(2);
  });

  test("list with status filter", () => {
    createIssue(db, { title: "A", status: "todo" });
    createIssue(db, { title: "B", status: "done" });
    const { issues } = listIssues(db, { status: ["todo"] });
    expect(issues.length).toBe(1);
    expect(issues[0].title).toBe("A");
  });

  test("list with search term matches title", () => {
    createIssue(db, { title: "Fix login bug" });
    createIssue(db, { title: "Add feature" });
    const { issues } = listIssues(db, { search: "login" });
    expect(issues.length).toBe(1);
    expect(issues[0].title).toBe("Fix login bug");
  });

  test("list with search term matches description", () => {
    createIssue(db, { title: "Issue", description: "The login is broken" });
    createIssue(db, { title: "Other" });
    const { issues } = listIssues(db, { search: "login" });
    expect(issues.length).toBe(1);
  });

  test("list with sort + order", () => {
    const a = createIssue(db, { title: "A" });
    const b = createIssue(db, { title: "B" });
    const { issues } = listIssues(db, { sort: "title", order: "ASC" });
    expect(issues[0].title).toBe("A");
    expect(issues[1].title).toBe("B");
  });

  test("list with limit", () => {
    for (let i = 0; i < 10; i++) createIssue(db, { title: `Issue ${i}` });
    const { issues, total } = listIssues(db, { limit: 3 });
    expect(issues.length).toBe(3);
    expect(total).toBe(10);
  });

  test("list with includeArchived=true", () => {
    createIssue(db, { title: "Active" });
    createIssue(db, { title: "Archived", status: "archived" });
    const { issues } = listIssues(db, { includeArchived: true });
    expect(issues.length).toBe(2);
  });

  test("update issue title only", () => {
    const issue = createIssue(db, { title: "Original" });
    const updated = updateIssue(db, issue.id, { title: "Updated" });
    expect(updated.title).toBe("Updated");
    expect(updated.status).toBe("todo");
    expect(updated.updated_at).toBeTruthy();
  });

  test("update issue with invalid status throws", () => {
    const config = createTestConfig();
    expect(() => validateStatus("invalid-status", config)).toThrow("Invalid status");
  });

  test("delete issue cascades to comments", () => {
    const issue = createIssue(db, { title: "To delete" });
    createComment(db, { issue_id: issue.id, body: "A comment" });
    deleteIssue(db, issue.id);
    expect(getIssue(db, issue.id)).toBeNull();
    const comments = db.query("SELECT * FROM comments WHERE issue_id = ?").all(issue.id);
    expect(comments.length).toBe(0);
  });

  test("getIssueCounts returns correct counts", () => {
    createIssue(db, { title: "A", status: "todo" });
    createIssue(db, { title: "B", status: "todo" });
    createIssue(db, { title: "C", status: "done" });
    const counts = getIssueCounts(db);
    expect(counts.todo).toBe(2);
    expect(counts.done).toBe(1);
  });
});
