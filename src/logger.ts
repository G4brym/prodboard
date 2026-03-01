import * as fs from "fs";
import * as path from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private logDir: string;
  private level: LogLevel;
  private maxSizeBytes: number;
  private maxFiles: number;
  private logFile: string;

  constructor(options: { logDir: string; level: LogLevel; maxSizeMb: number; maxFiles: number }) {
    this.logDir = options.logDir;
    this.level = options.level;
    this.maxSizeBytes = options.maxSizeMb * 1024 * 1024;
    this.maxFiles = options.maxFiles;
    this.logFile = path.join(this.logDir, "daemon.log");

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.log("debug", msg, data);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.log("info", msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.log("warn", msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this.log("error", msg, data);
  }

  private log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;

    const timestamp = new Date().toISOString();
    const dataStr = data ? " " + JSON.stringify(data) : "";
    const line = `[${timestamp}] [${level.toUpperCase()}] ${msg}${dataStr}\n`;

    this.rotate();
    fs.appendFileSync(this.logFile, line);

    // Also output to stderr
    process.stderr.write(line);
  }

  private rotate(): void {
    try {
      if (!fs.existsSync(this.logFile)) return;
      const stat = fs.statSync(this.logFile);
      if (stat.size < this.maxSizeBytes) return;

      // Shift existing rotated files
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const src = path.join(this.logDir, `daemon.${i}.log`);
        const dst = path.join(this.logDir, `daemon.${i + 1}.log`);
        if (fs.existsSync(src)) {
          if (i + 1 > this.maxFiles) {
            fs.unlinkSync(src);
          } else {
            fs.renameSync(src, dst);
          }
        }
      }

      // Move current to .1
      fs.renameSync(this.logFile, path.join(this.logDir, "daemon.1.log"));
    } catch {}
  }
}
