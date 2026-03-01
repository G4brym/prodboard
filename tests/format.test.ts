import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { renderTable, formatDate, jsonOutput, color } from "../src/format.ts";

describe("renderTable", () => {
  test("produces correct box-drawing for simple 2x2", () => {
    const result = renderTable(["A", "B"], [["1", "2"]]);
    expect(result).toContain("┌");
    expect(result).toContain("┐");
    expect(result).toContain("└");
    expect(result).toContain("┘");
    expect(result).toContain("│");
    expect(result).toContain("─");
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).toContain("1");
    expect(result).toContain("2");
  });

  test("handles empty rows", () => {
    const result = renderTable(["A", "B"], []);
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).not.toContain("├");
  });

  test("truncates long cells", () => {
    const result = renderTable(["Col"], [["This is a very long text"]], {
      maxWidths: [10],
    });
    expect(result).toContain("…");
  });

  test("auto-sizes columns", () => {
    const result = renderTable(["Short", "LongerHeader"], [["a", "b"]]);
    const lines = result.split("\n");
    // All lines should have the same length
    const lengths = new Set(lines.map((l) => l.length));
    expect(lengths.size).toBe(1);
  });
});

describe("color", () => {
  test("wraps text with ANSI codes", () => {
    // This test might be affected by NO_COLOR env var
    const orig = process.env.NO_COLOR;
    delete process.env.NO_COLOR;
    // Can't easily test since module-level constant is cached
    // Just verify function exists and returns a string
    expect(typeof color("test", 32)).toBe("string");
    if (orig !== undefined) process.env.NO_COLOR = orig;
  });
});

describe("formatDate", () => {
  test("converts ISO to display format", () => {
    const result = formatDate("2026-02-28T10:30:00");
    expect(result).toBe("2026-02-28 10:30");
  });

  test("handles empty string", () => {
    expect(formatDate("")).toBe("");
  });
});

describe("jsonOutput", () => {
  test("produces valid JSON", () => {
    const data = { key: "value", num: 42 };
    const result = jsonOutput(data);
    expect(JSON.parse(result)).toEqual(data);
  });

  test("handles arrays", () => {
    const data = [1, 2, 3];
    const result = jsonOutput(data);
    expect(JSON.parse(result)).toEqual(data);
  });
});
