import { describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");

describe("Project Scaffold", () => {
  test("bin/prodboard.ts exists and is importable", async () => {
    const binPath = resolve(ROOT, "bin/prodboard.ts");
    expect(existsSync(binPath)).toBe(true);
  });

  test("package.json has correct bin entries", async () => {
    const pkg = await import(resolve(ROOT, "package.json"));
    expect(pkg.bin.prodboard).toBe("bin/prodboard.ts");
    expect(pkg.bin.pb).toBe("bin/prodboard.ts");
  });

  test("package.json has correct name and type", async () => {
    const pkg = await import(resolve(ROOT, "package.json"));
    expect(pkg.name).toBe("prodboard");
    expect(pkg.type).toBe("module");
  });

  test("src/index.ts exports main function", async () => {
    const { main } = await import(resolve(ROOT, "src/index.ts"));
    expect(typeof main).toBe("function");
  });

  test("directory structure exists", () => {
    expect(existsSync(resolve(ROOT, "src"))).toBe(true);
    expect(existsSync(resolve(ROOT, "src/commands"))).toBe(true);
    expect(existsSync(resolve(ROOT, "src/queries"))).toBe(true);
    expect(existsSync(resolve(ROOT, "templates"))).toBe(true);
    expect(existsSync(resolve(ROOT, "tests"))).toBe(true);
  });
});
