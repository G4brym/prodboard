import * as fs from "fs";

export class TmuxManager {
  private available: boolean | null = null;

  isAvailable(): boolean {
    if (this.available !== null) return this.available;
    try {
      const result = Bun.spawnSync(["tmux", "-V"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      this.available = result.exitCode === 0;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  sessionName(runId: string): string {
    return "prodboard-" + runId.slice(0, 8);
  }

  wrapCommand(sessionName: string, cmd: string[], jsonlPath: string): string[] {
    const escaped = cmd.map((arg) => shellEscape(arg)).join(" ");
    const bashCmd = `${escaped} > ${shellEscape(jsonlPath)} 2>&1; echo $? > ${shellEscape(jsonlPath)}.exit`;
    return [
      "tmux", "new-session", "-d", "-s", sessionName,
      "bash", "-c", bashCmd,
    ];
  }

  async waitForCompletion(sessionName: string, jsonlPath: string): Promise<number> {
    // Poll until tmux session ends
    while (true) {
      const result = Bun.spawnSync(["tmux", "has-session", "-t", sessionName], {
        stdout: "pipe",
        stderr: "pipe",
      });
      if (result.exitCode !== 0) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Read exit code from .exit file
    const exitFile = `${jsonlPath}.exit`;
    try {
      const code = fs.readFileSync(exitFile, "utf-8").trim();
      return parseInt(code, 10) || 1;
    } catch {
      return 1;
    }
  }

  killSession(sessionName: string): void {
    try {
      Bun.spawnSync(["tmux", "kill-session", "-t", sessionName], {
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch {}
  }
}

function shellEscape(arg: string): string {
  if (/^[a-zA-Z0-9_./:=@,-]+$/.test(arg)) return arg;
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}
