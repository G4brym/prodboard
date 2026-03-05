import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import crypto from "crypto";
import { createTestDb, createTestConfig } from "./helpers.ts";
import { createApp } from "../src/webui/index.ts";
import { createIssue } from "../src/queries/issues.ts";
import { createComment } from "../src/queries/comments.ts";
import { createSchedule } from "../src/queries/schedules.ts";
import { createRun, updateRun } from "../src/queries/runs.ts";
import type { Config } from "../src/types.ts";

const TEST_AUTH_SALT = "test-salt-for-webui-tests";

let db: Database;
let config: Config;

function app(configOverrides?: Partial<Config>) {
  const cfg = configOverrides ? { ...config, ...configOverrides } : config;
  return createApp(db, cfg, TEST_AUTH_SALT);
}

async function get(path: string, configOverrides?: Partial<Config>) {
  return app(configOverrides).request(path);
}

async function post(path: string, body: Record<string, string>, configOverrides?: Partial<Config>) {
  const formData = new URLSearchParams(body);
  return app(configOverrides).request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "http://localhost",
    },
    body: formData.toString(),
  });
}

function generateTestToken(password: string): string {
  return crypto.createHmac("sha256", TEST_AUTH_SALT).update(password).digest("hex");
}

beforeEach(() => {
  db = createTestDb();
  config = createTestConfig();
});

describe("Web UI - Issues", () => {
  test("GET /issues returns 200 with board HTML", async () => {
    createIssue(db, { title: "Test Issue", description: "A test" });
    const res = await get("/issues");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Test Issue");
    expect(html).toContain("Issues");
  });

  test("GET /issues groups by status", async () => {
    createIssue(db, { title: "Todo Item", status: "todo" });
    createIssue(db, { title: "In Progress Item", status: "in-progress" });
    const res = await get("/issues");
    const html = await res.text();
    expect(html).toContain("Todo Item");
    expect(html).toContain("In Progress Item");
  });

  test("POST /issues creates issue and redirects", async () => {
    const res = await post("/issues", { title: "New Issue", description: "desc", status: "todo" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/issues");

    // Verify in DB
    const { issues } = await import("../src/queries/issues.ts").then((m) => m.listIssues(db, {}));
    expect(issues.length).toBe(1);
    expect(issues[0].title).toBe("New Issue");
  });

  test("GET /issues/:id shows issue detail with comments", async () => {
    const issue = createIssue(db, { title: "Detail Issue", description: "Some description" });
    createComment(db, { issue_id: issue.id, body: "A comment", author: "test" });
    const res = await get(`/issues/${issue.id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Detail Issue");
    expect(html).toContain("Some description");
    expect(html).toContain("A comment");
  });

  test("POST /issues/:id/move updates status", async () => {
    const issue = createIssue(db, { title: "Move me" });
    const res = await post(`/issues/${issue.id}/move`, { status: "done" });
    expect(res.status).toBe(302);

    const { getIssue } = await import("../src/queries/issues.ts");
    const updated = getIssue(db, issue.id)!;
    expect(updated.status).toBe("done");
  });

  test("POST /issues/:id/delete removes issue", async () => {
    const issue = createIssue(db, { title: "Delete me" });
    const res = await post(`/issues/${issue.id}/delete`, {});
    expect(res.status).toBe(302);

    const { getIssue } = await import("../src/queries/issues.ts");
    expect(getIssue(db, issue.id)).toBeNull();
  });

  test("POST /issues/:id/comment adds comment", async () => {
    const issue = createIssue(db, { title: "Comment test" });
    const res = await post(`/issues/${issue.id}/comment`, { body: "My comment" });
    expect(res.status).toBe(302);

    const { listComments } = await import("../src/queries/comments.ts");
    const comments = listComments(db, issue.id);
    expect(comments.length).toBe(1);
    expect(comments[0].body).toBe("My comment");
  });
});

describe("Web UI - Issues Error Paths", () => {
  test("GET /issues/:id returns 404 for invalid ID", async () => {
    const res = await get("/issues/nonexistent-id");
    expect(res.status).toBe(404);
  });

  test("POST /issues with empty title returns 400", async () => {
    const res = await post("/issues", { title: "  ", description: "", status: "todo" });
    expect(res.status).toBe(400);
  });

  test("POST /issues/:id/move with invalid status returns 400", async () => {
    const issue = createIssue(db, { title: "Test" });
    const res = await post(`/issues/${issue.id}/move`, { status: "INVALID_STATUS" });
    expect(res.status).toBe(400);
  });
});

describe("Web UI - Schedules", () => {
  test("GET /schedules lists all schedules", async () => {
    createSchedule(db, { name: "Test Schedule", cron: "* * * * *", prompt: "go" });
    const res = await get("/schedules");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Test Schedule");
  });

  test("POST /schedules creates schedule", async () => {
    const res = await post("/schedules", {
      name: "New Schedule",
      cron: "*/5 * * * *",
      prompt: "do work",
      workdir: ".",
    });
    expect(res.status).toBe(302);

    const { listSchedules } = await import("../src/queries/schedules.ts");
    const schedules = listSchedules(db, { includeDisabled: true });
    expect(schedules.length).toBe(1);
    expect(schedules[0].name).toBe("New Schedule");
  });

  test("POST /schedules/:id/toggle enables/disables", async () => {
    const s = createSchedule(db, { name: "Toggle", cron: "* * * * *", prompt: "go" });
    // Disable
    let res = await post(`/schedules/${s.id}/toggle`, {});
    expect(res.status).toBe(302);
    const { getSchedule } = await import("../src/queries/schedules.ts");
    expect(getSchedule(db, s.id)!.enabled).toBe(0);

    // Enable again
    res = await post(`/schedules/${s.id}/toggle`, {});
    expect(res.status).toBe(302);
    expect(getSchedule(db, s.id)!.enabled).toBe(1);
  });

  test("POST /schedules/:id/delete removes schedule", async () => {
    const s = createSchedule(db, { name: "Del", cron: "* * * * *", prompt: "go" });
    const res = await post(`/schedules/${s.id}/delete`, {});
    expect(res.status).toBe(302);

    const { getSchedule } = await import("../src/queries/schedules.ts");
    expect(getSchedule(db, s.id)).toBeNull();
  });
});

describe("Web UI - Schedules Error Paths", () => {
  test("POST /schedules with empty name returns 400", async () => {
    const res = await post("/schedules", { name: "", cron: "* * * * *", prompt: "go", workdir: "." });
    expect(res.status).toBe(400);
  });

  test("POST /schedules with empty cron returns 400", async () => {
    const res = await post("/schedules", { name: "test", cron: "", prompt: "go", workdir: "." });
    expect(res.status).toBe(400);
  });

  test("POST /schedules with invalid cron returns 400", async () => {
    const res = await post("/schedules", { name: "test", cron: "bad cron", prompt: "go", workdir: "." });
    expect(res.status).toBe(400);
  });

  test("POST /schedules with empty prompt returns 400", async () => {
    const res = await post("/schedules", { name: "test", cron: "* * * * *", prompt: "", workdir: "." });
    expect(res.status).toBe(400);
  });

  test("GET /schedules/:id/toggle with invalid ID returns 404", async () => {
    const res = await post("/schedules/nonexistent-id/toggle", {});
    expect(res.status).toBe(404);
  });
});

describe("Web UI - Runs", () => {
  test("GET /runs shows runs", async () => {
    const s = createSchedule(db, { name: "Sched", cron: "* * * * *", prompt: "go" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    updateRun(db, r.id, { status: "success" });
    const res = await get("/runs");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Runs");
    expect(html).toContain(r.id.slice(0, 8));
  });

  test("GET /runs/:id shows run detail", async () => {
    const s = createSchedule(db, { name: "Sched", cron: "* * * * *", prompt: "go" });
    const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
    updateRun(db, r.id, { status: "success", tokens_in: 100, cost_usd: 0.05 });
    const res = await get(`/runs/${r.id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("$0.0500");
  });

  test("GET /api/status returns JSON with run counts", async () => {
    const s = createSchedule(db, { name: "S", cron: "* * * * *", prompt: "go" });
    createRun(db, { schedule_id: s.id, prompt_used: "go" });
    const res = await get("/api/status");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.active_runs).toBe(1);
  });
});

describe("Web UI - Auth", () => {
  test("no auth required when password is null", async () => {
    const res = await get("/issues");
    expect(res.status).toBe(200);
  });

  test("redirects to /login when password set and no cookie", async () => {
    const res = await get("/issues", { webui: { enabled: true, port: 3838, hostname: "127.0.0.1", password: "secret" } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  test("POST /login sets cookie and redirects", async () => {
    const cfg: Partial<Config> = { webui: { enabled: true, port: 3838, hostname: "127.0.0.1", password: "secret" } };
    const res = await post("/login", { password: "secret" }, cfg);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain("prodboard_auth=");
  });

  test("authenticated requests pass through", async () => {
    const cfg = { webui: { enabled: true, port: 3838, hostname: "127.0.0.1", password: "secret" } } as Partial<Config>;
    const token = generateTestToken("secret");
    const a = createApp(db, { ...config, ...cfg } as Config, TEST_AUTH_SALT);
    const res = await a.request("/issues", {
      headers: { Cookie: `prodboard_auth=${token}` },
    });
    expect(res.status).toBe(200);
  });

  test("wrong password login redirects to error", async () => {
    const cfg: Partial<Config> = { webui: { enabled: true, port: 3838, hostname: "127.0.0.1", password: "secret" } };
    const res = await post("/login", { password: "wrong" }, cfg);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=1");
  });

  test("/api/status requires auth when password is set", async () => {
    const cfg: Partial<Config> = { webui: { enabled: true, port: 3838, hostname: "127.0.0.1", password: "secret" } };
    const res = await get("/api/status", cfg);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  test("empty string password enables auth", async () => {
    const cfg: Partial<Config> = { webui: { enabled: true, port: 3838, hostname: "127.0.0.1", password: "" } };
    const res = await get("/issues", cfg);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });
});
