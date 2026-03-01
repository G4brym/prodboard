import { describe, expect, test } from "bun:test";
import { parseCronField, parseCronExpression, shouldFire, validateCron, getNextFire } from "../src/cron.ts";

describe("Cron Parser", () => {
  describe("parseCronField", () => {
    test("* matches all values", () => {
      const result = parseCronField("*", 0, 59);
      expect(result.size).toBe(60);
    });

    test("*/5 in minute field", () => {
      const result = parseCronField("*/5", 0, 59);
      expect(result.has(0)).toBe(true);
      expect(result.has(5)).toBe(true);
      expect(result.has(55)).toBe(true);
      expect(result.has(3)).toBe(false);
      expect(result.size).toBe(12);
    });

    test("1-5 matches range", () => {
      const result = parseCronField("1-5", 0, 59);
      expect(result.size).toBe(5);
      for (let i = 1; i <= 5; i++) expect(result.has(i)).toBe(true);
    });

    test("1,3,5 matches exactly those values", () => {
      const result = parseCronField("1,3,5", 0, 59);
      expect(result.size).toBe(3);
      expect(result.has(1)).toBe(true);
      expect(result.has(3)).toBe(true);
      expect(result.has(5)).toBe(true);
    });
  });

  describe("shouldFire", () => {
    test("0 9 * * 1-5 matches weekdays at 9:00", () => {
      // 2026-03-02 is a Monday
      const mon = new Date(2026, 2, 2, 9, 0);
      expect(shouldFire("0 9 * * 1-5", mon)).toBe(true);

      // Saturday
      const sat = new Date(2026, 2, 7, 9, 0);
      expect(shouldFire("0 9 * * 1-5", sat)).toBe(false);
    });

    test("*/15 * * * * matches every 15 minutes", () => {
      const d0 = new Date(2026, 0, 1, 0, 0);
      expect(shouldFire("*/15 * * * *", d0)).toBe(true);
      const d15 = new Date(2026, 0, 1, 0, 15);
      expect(shouldFire("*/15 * * * *", d15)).toBe(true);
      const d7 = new Date(2026, 0, 1, 0, 7);
      expect(shouldFire("*/15 * * * *", d7)).toBe(false);
    });

    test("0 0 1 * * matches first of every month at midnight", () => {
      const jan1 = new Date(2026, 0, 1, 0, 0);
      expect(shouldFire("0 0 1 * *", jan1)).toBe(true);
      const jan2 = new Date(2026, 0, 2, 0, 0);
      expect(shouldFire("0 0 1 * *", jan2)).toBe(false);
    });

    test("day-of-week: 0=Sunday, 6=Saturday", () => {
      // 2026-03-01 is a Sunday
      const sun = new Date(2026, 2, 1, 0, 0);
      expect(shouldFire("0 0 * * 0", sun)).toBe(true);
      expect(shouldFire("0 0 * * 6", sun)).toBe(false);
    });
  });

  describe("validateCron", () => {
    test("valid expressions", () => {
      expect(validateCron("* * * * *").valid).toBe(true);
      expect(validateCron("0 9 * * 1-5").valid).toBe(true);
      expect(validateCron("*/15 * * * *").valid).toBe(true);
    });

    test("invalid: too few fields", () => {
      expect(validateCron("* *").valid).toBe(false);
    });

    test("invalid: out of range", () => {
      expect(validateCron("60 * * * *").valid).toBe(false);
    });

    test("invalid: non-numeric", () => {
      expect(validateCron("abc * * * *").valid).toBe(false);
    });
  });

  describe("getNextFire", () => {
    test("calculates correct next fire time", () => {
      // Every hour at :00
      const after = new Date(2026, 0, 1, 10, 30);
      const next = getNextFire("0 * * * *", after);
      expect(next.getHours()).toBe(11);
      expect(next.getMinutes()).toBe(0);
    });

    test("wraps to next day", () => {
      const after = new Date(2026, 0, 1, 23, 30);
      const next = getNextFire("0 0 * * *", after);
      expect(next.getDate()).toBe(2);
      expect(next.getHours()).toBe(0);
    });
  });
});
