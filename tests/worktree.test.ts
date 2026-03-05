import { describe, expect, test, afterEach } from "bun:test";
import { WorktreeManager } from "../src/worktree.ts";
import { createTempDir } from "./helpers.ts";
import * as fs from "fs";

let cleanups: (() => void)[] = [];

function setupGitRepo(): { path: string; cleanup: () => void } {
  const tmp = createTempDir();
  cleanups.push(tmp.cleanup);

  // Initialize a git repo with an initial commit
  Bun.spawnSync(["git", "init"], { cwd: tmp.path, stdout: "pipe", stderr: "pipe" });
  Bun.spawnSync(["git", "config", "user.email", "test@test.com"], { cwd: tmp.path, stdout: "pipe", stderr: "pipe" });
  Bun.spawnSync(["git", "config", "user.name", "Test"], { cwd: tmp.path, stdout: "pipe", stderr: "pipe" });
  fs.writeFileSync(`${tmp.path}/README.md`, "# test");
  Bun.spawnSync(["git", "add", "."], { cwd: tmp.path, stdout: "pipe", stderr: "pipe" });
  Bun.spawnSync(["git", "commit", "-m", "init"], { cwd: tmp.path, stdout: "pipe", stderr: "pipe" });

  return tmp;
}

afterEach(() => {
  for (const cleanup of cleanups) {
    try { cleanup(); } catch {}
  }
  cleanups = [];
});

describe("WorktreeManager", () => {
  test("create() creates worktree directory and branch", async () => {
    const repo = setupGitRepo();
    const manager = new WorktreeManager(repo.path);

    const worktreePath = await manager.create("test-run-1", repo.path);
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Verify branch exists
    const result = Bun.spawnSync(["git", "branch"], { cwd: repo.path, stdout: "pipe", stderr: "pipe" });
    const branches = new TextDecoder().decode(result.stdout);
    expect(branches).toContain("prodboard/test-run-1");

    // Cleanup
    await manager.remove("test-run-1");
  });

  test("create() returns absolute worktree path", async () => {
    const repo = setupGitRepo();
    const manager = new WorktreeManager(repo.path);

    const worktreePath = await manager.create("test-run-2", repo.path);
    expect(worktreePath.startsWith("/")).toBe(true);

    await manager.remove("test-run-2");
  });

  test("remove() deletes worktree and branch", async () => {
    const repo = setupGitRepo();
    const manager = new WorktreeManager(repo.path);

    const worktreePath = await manager.create("test-run-3", repo.path);
    expect(fs.existsSync(worktreePath)).toBe(true);

    await manager.remove("test-run-3");

    // Worktree dir should be gone
    expect(fs.existsSync(worktreePath)).toBe(false);

    // Branch should be gone
    const result = Bun.spawnSync(["git", "branch"], { cwd: repo.path, stdout: "pipe", stderr: "pipe" });
    const branches = new TextDecoder().decode(result.stdout);
    expect(branches).not.toContain("prodboard/test-run-3");
  });

  test("remove() is idempotent", async () => {
    const repo = setupGitRepo();
    const manager = new WorktreeManager(repo.path);

    const worktreePath = await manager.create("test-run-4", repo.path);
    await manager.remove("test-run-4");
    // Second remove should not throw
    await manager.remove("test-run-4");
  });

  test("isGitRepo() returns true for git repos", () => {
    const repo = setupGitRepo();
    const manager = new WorktreeManager(repo.path);
    expect(manager.isGitRepo(repo.path)).toBe(true);
  });

  test("isGitRepo() returns false for non-git dirs", () => {
    const tmpPath = `/tmp/.prodboard-test-nogit-${Date.now()}`;
    fs.mkdirSync(tmpPath, { recursive: true });
    cleanups.push(() => { try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {} });
    const manager = new WorktreeManager(tmpPath);
    expect(manager.isGitRepo(tmpPath)).toBe(false);
  });

  test("create() throws for non-git directory", async () => {
    const tmpPath = `/tmp/.prodboard-test-nogit2-${Date.now()}`;
    fs.mkdirSync(tmpPath, { recursive: true });
    cleanups.push(() => { try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {} });
    const manager = new WorktreeManager(tmpPath);

    expect(manager.create("test-run-5", tmpPath)).rejects.toThrow();
  });
});
