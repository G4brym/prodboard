import * as path from "path";
import * as fs from "fs";

export class WorktreeManager {
  constructor(private basePath: string) {}

  async create(runId: string, sourceDir: string): Promise<string> {
    const worktreesDir = path.join(this.basePath, ".worktrees");
    const worktreePath = path.join(worktreesDir, runId);
    const branchName = `prodboard/${runId}`;

    if (!fs.existsSync(worktreesDir)) {
      fs.mkdirSync(worktreesDir, { recursive: true });
    }

    const result = Bun.spawnSync(
      ["git", "worktree", "add", worktreePath, "-b", branchName],
      { cwd: sourceDir, stdout: "pipe", stderr: "pipe" }
    );

    if (result.exitCode !== 0) {
      const stderr = new TextDecoder().decode(result.stderr);
      throw new Error(`Failed to create worktree: ${stderr}`);
    }

    return path.resolve(worktreePath);
  }

  async remove(runId: string): Promise<void> {
    const worktreePath = path.join(this.basePath, ".worktrees", runId);
    const branchName = `prodboard/${runId}`;

    // Remove worktree
    try {
      Bun.spawnSync(
        ["git", "worktree", "remove", worktreePath, "--force"],
        { cwd: this.basePath, stdout: "pipe", stderr: "pipe" }
      );
    } catch {}

    // Clean up the directory if it still exists
    try {
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
    } catch {}

    // Delete the branch (try safe delete first, force-delete as fallback)
    try {
      const result = Bun.spawnSync(
        ["git", "branch", "-d", branchName],
        { cwd: this.basePath, stdout: "pipe", stderr: "pipe" }
      );
      if (result.exitCode !== 0) {
        console.error(`[prodboard] Warning: Branch ${branchName} has unmerged commits, force-deleting`);
        Bun.spawnSync(
          ["git", "branch", "-D", branchName],
          { cwd: this.basePath, stdout: "pipe", stderr: "pipe" }
        );
      }
    } catch {}
  }

  isGitRepo(dir: string): boolean {
    try {
      const result = Bun.spawnSync(
        ["git", "rev-parse", "--git-dir"],
        { cwd: dir, stdout: "pipe", stderr: "pipe" }
      );
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
}
