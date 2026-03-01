import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "./helpers.ts";
import {
  createSchedule, getSchedule, getScheduleByPrefix, listSchedules,
  updateSchedule, deleteSchedule, enableSchedule, disableSchedule,
} from "../src/queries/schedules.ts";

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe("Schedule Queries", () => {
  test("create schedule", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "do stuff" });
    expect(s.id).toMatch(/^[0-9a-f]{8}$/);
    expect(s.name).toBe("test");
    expect(s.cron).toBe("* * * * *");
    expect(s.enabled).toBe(1);
    expect(s.source).toBe("cli");
  });

  test("get schedule by prefix", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "do stuff" });
    const found = getScheduleByPrefix(db, s.id.slice(0, 4));
    expect(found.id).toBe(s.id);
  });

  test("list filters disabled by default", () => {
    createSchedule(db, { name: "enabled", cron: "* * * * *", prompt: "go" });
    const s2 = createSchedule(db, { name: "disabled", cron: "* * * * *", prompt: "stop" });
    disableSchedule(db, s2.id);

    const list = listSchedules(db);
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("enabled");
  });

  test("list with includeDisabled", () => {
    createSchedule(db, { name: "a", cron: "* * * * *", prompt: "go" });
    const s2 = createSchedule(db, { name: "b", cron: "* * * * *", prompt: "stop" });
    disableSchedule(db, s2.id);

    const list = listSchedules(db, { includeDisabled: true });
    expect(list.length).toBe(2);
  });

  test("enable/disable toggles", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    disableSchedule(db, s.id);
    expect(getSchedule(db, s.id)!.enabled).toBe(0);
    enableSchedule(db, s.id);
    expect(getSchedule(db, s.id)!.enabled).toBe(1);
  });

  test("update schedule", () => {
    const s = createSchedule(db, { name: "old", cron: "* * * * *", prompt: "old" });
    const updated = updateSchedule(db, s.id, { name: "new" as any });
    expect(updated.name).toBe("new");
    expect(updated.cron).toBe("* * * * *");
  });

  test("delete cascades to runs", () => {
    const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
    // Create a run
    const { createRun } = require("../src/queries/runs.ts");
    createRun(db, { schedule_id: s.id, prompt_used: "test" });

    deleteSchedule(db, s.id);
    expect(getSchedule(db, s.id)).toBeNull();
    const runs = db.query("SELECT * FROM runs WHERE schedule_id = ?").all(s.id);
    expect(runs.length).toBe(0);
  });
});
