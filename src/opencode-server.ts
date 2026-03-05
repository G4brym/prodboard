import type { Config } from "./types.ts";

export class OpenCodeServerManager {
  private serverProcess: any = null;
  private _url: string;

  constructor(config: Config) {
    this._url = config.daemon.opencode.serverUrl ?? "http://localhost:4096";
  }

  async isRunning(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this._url}/global/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  async ensureRunning(): Promise<string> {
    if (await this.isRunning()) return this._url;

    this.serverProcess = Bun.spawn(["opencode", "serve"], {
      stdout: "ignore",
      stderr: "ignore",
      env: process.env,
    });

    // Poll health endpoint for up to 30s
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (await this.isRunning()) return this._url;
    }

    throw new Error(`OpenCode server failed to start at ${this._url} within 30 seconds`);
  }

  async stop(): Promise<void> {
    if (this.serverProcess) {
      try {
        this.serverProcess.kill("SIGTERM");
      } catch {}
      this.serverProcess = null;
    }
  }

  get url(): string {
    return this._url;
  }
}
