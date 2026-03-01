import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "./helpers.ts";
import { createIssue, deleteIssue } from "../src/queries/issues.ts";
import { createComment, listComments, getCommentCount } from "../src/queries/comments.ts";

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe("Comment Queries", () => {
  test("create comment with default author", () => {
    const issue = createIssue(db, { title: "Test" });
    const comment = createComment(db, { issue_id: issue.id, body: "Hello" });
    expect(comment.author).toBe("user");
    expect(comment.body).toBe("Hello");
    expect(comment.issue_id).toBe(issue.id);
  });

  test("create comment with explicit author", () => {
    const issue = createIssue(db, { title: "Test" });
    const comment = createComment(db, { issue_id: issue.id, body: "Hi", author: "claude" });
    expect(comment.author).toBe("claude");
  });

  test("list comments returns chronological order", () => {
    const issue = createIssue(db, { title: "Test" });
    createComment(db, { issue_id: issue.id, body: "First" });
    createComment(db, { issue_id: issue.id, body: "Second" });
    const comments = listComments(db, issue.id);
    expect(comments.length).toBe(2);
    expect(comments[0].body).toBe("First");
    expect(comments[1].body).toBe("Second");
  });

  test("list comments for issue with no comments returns empty", () => {
    const issue = createIssue(db, { title: "Test" });
    const comments = listComments(db, issue.id);
    expect(comments).toEqual([]);
  });

  test("creating comment for non-existent issue throws FK error", () => {
    expect(() => createComment(db, { issue_id: "nonexistent", body: "test" })).toThrow();
  });

  test("comment count returns correct number", () => {
    const issue = createIssue(db, { title: "Test" });
    createComment(db, { issue_id: issue.id, body: "A" });
    createComment(db, { issue_id: issue.id, body: "B" });
    expect(getCommentCount(db, issue.id)).toBe(2);
  });

  test("comments are deleted when parent issue is deleted", () => {
    const issue = createIssue(db, { title: "Test" });
    createComment(db, { issue_id: issue.id, body: "Will be deleted" });
    deleteIssue(db, issue.id);
    expect(getCommentCount(db, issue.id)).toBe(0);
  });
});
