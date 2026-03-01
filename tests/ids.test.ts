import { describe, expect, test } from "bun:test";
import { generateId } from "../src/ids.ts";

describe("ID Generation", () => {
  test("returns 8-char hex string", () => {
    const id = generateId();
    expect(id.length).toBe(8);
  });

  test("only contains hex chars [0-9a-f]", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  test("each call returns a unique value", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });
});
