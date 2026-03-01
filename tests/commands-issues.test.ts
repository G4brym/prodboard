import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "./helpers.ts";
import { add, ls, show, edit, mv, rm } from "../src/commands/issues.ts";
import { comment, comments } from "../src/commands/comments.ts";
import { createIssue } from "../src/queries/issues.ts";
import { createComment } from "../src/queries/comments.ts";
import { captureOutput } from "./helpers.ts";

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe("CLI Issue Commands", () => {
  test("add creates issue and prints confirmation", async () => {
    const { stdout } = await captureOutput(async () => {
      await add(["Fix", "login", "bug"], db);
    });
    expect(stdout).toContain("Created issue");
    expect(stdout).toContain("Fix login bug");
  });

  test("ls renders table with correct columns", async () => {
    createIssue(db, { title: "Test issue" });
    const { stdout } = await captureOutput(async () => {
      await ls([], db);
    });
    expect(stdout).toContain("ID");
    expect(stdout).toContain("Title");
    expect(stdout).toContain("Status");
    expect(stdout).toContain("Test issue");
  });

  test("ls --json outputs JSON", async () => {
    createIssue(db, { title: "JSON test" });
    const { stdout } = await captureOutput(async () => {
      await ls(["--json"], db);
    });
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].title).toBe("JSON test");
  });

  test("ls --status todo filters correctly", async () => {
    createIssue(db, { title: "Todo", status: "todo" });
    createIssue(db, { title: "Done", status: "done" });
    const { stdout } = await captureOutput(async () => {
      await ls(["--status", "todo"], db);
    });
    expect(stdout).toContain("Todo");
    expect(stdout).not.toContain("Done");
  });

  test("ls --search matches", async () => {
    createIssue(db, { title: "Fix login bug" });
    createIssue(db, { title: "Add feature" });
    const { stdout } = await captureOutput(async () => {
      await ls(["--search", "login"], db);
    });
    expect(stdout).toContain("login");
    expect(stdout).not.toContain("Add feature");
  });

  test("show displays issue details with comments", async () => {
    const issue = createIssue(db, { title: "Show test", description: "A description" });
    createComment(db, { issue_id: issue.id, body: "A comment", author: "claude" });

    const { stdout } = await captureOutput(async () => {
      await show([issue.id], db);
    });
    expect(stdout).toContain("Show test");
    expect(stdout).toContain("A description");
    expect(stdout).toContain("A comment");
    expect(stdout).toContain("claude");
  });

  test("show with prefix ID works", async () => {
    const issue = createIssue(db, { title: "Prefix show" });
    const prefix = issue.id.slice(0, 4);
    const { stdout } = await captureOutput(async () => {
      await show([prefix], db);
    });
    expect(stdout).toContain("Prefix show");
  });

  test("edit --title updates title", async () => {
    const issue = createIssue(db, { title: "Original" });
    const { stdout } = await captureOutput(async () => {
      await edit([issue.id, "--title", "Updated"], db);
    });
    expect(stdout).toContain("Updated");
  });

  test("mv changes status", async () => {
    const issue = createIssue(db, { title: "To move" });
    const { stdout } = await captureOutput(async () => {
      await mv([issue.id, "done"], db);
    });
    expect(stdout).toContain("done");
  });

  test("rm --force deletes", async () => {
    const issue = createIssue(db, { title: "To delete" });
    const { stdout } = await captureOutput(async () => {
      await rm([issue.id, "--force"], db);
    });
    expect(stdout).toContain("Deleted");
  });

  test("comment adds comment to issue", async () => {
    const issue = createIssue(db, { title: "For comment" });
    const { stdout } = await captureOutput(async () => {
      await comment([issue.id, "Test", "comment"], db);
    });
    expect(stdout).toContain("Added comment");
  });

  test("comments lists all comments", async () => {
    const issue = createIssue(db, { title: "For listing" });
    createComment(db, { issue_id: issue.id, body: "Comment 1" });
    createComment(db, { issue_id: issue.id, body: "Comment 2" });
    const { stdout } = await captureOutput(async () => {
      await comments([issue.id], db);
    });
    expect(stdout).toContain("Comment 1");
    expect(stdout).toContain("Comment 2");
  });
});
