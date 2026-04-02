import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { init } from "../src/commands/init.ts";

const BUN = process.env.HOME + "/.bun/bin/bun";
const BIN = path.resolve(import.meta.dir, "../bin/prodboard.ts");

let tmpHome: string;

beforeAll(async () => {
  tmpHome = `/tmp/prodboard-mcp-integration-${Date.now()}`;
  fs.mkdirSync(tmpHome, { recursive: true });
  // Init prodboard in temp home
  const prodboardDir = path.join(tmpHome, ".prodboard");
  await init([], prodboardDir);
});

afterAll(() => {
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

async function sendJsonRpc(
  proc: any,
  method: string,
  params?: any,
  id: number = 1
): Promise<any> {
  const request = JSON.stringify({ jsonrpc: "2.0", method, params, id }) + "\n";
  proc.stdin.write(request);
  proc.stdin.flush();

  // Read response line by line
  const reader = proc.stdout.getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += new TextDecoder().decode(value);
    const lines = buffer.split("\n");
    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line.trim());
          reader.releaseLock();
          return parsed;
        } catch {}
      }
    }
  }
  reader.releaseLock();
  return null;
}

describe("MCP Integration", () => {
  test("spawns MCP server and handles initialize + tools/list + tools/call", async () => {
    const proc = Bun.spawn([BUN, "run", BIN, "mcp"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: tmpHome },
    });

    try {
      // Send initialize
      const initResponse = await sendJsonRpc(proc, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0.1.0" },
      });
      expect(initResponse.result).toBeTruthy();
      expect(initResponse.result.serverInfo.name).toBe("prodboard");

      // Send initialized notification
      const initNotif = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n";
      proc.stdin.write(initNotif);
      proc.stdin.flush();

      // List tools
      const toolsResponse = await sendJsonRpc(proc, "tools/list", {}, 2);
      expect(toolsResponse.result.tools.length).toBeGreaterThan(0);
      const toolNames = toolsResponse.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain("list_issues");
      expect(toolNames).toContain("board_summary");

      // Create an issue
      const createResponse = await sendJsonRpc(proc, "tools/call", {
        name: "create_issue",
        arguments: { title: "Integration test issue" },
      }, 3);
      expect(createResponse.result).toBeTruthy();
      const created = JSON.parse(createResponse.result.content[0].text);
      expect(created.title).toBe("Integration test issue");

      // List issues
      const listResponse = await sendJsonRpc(proc, "tools/call", {
        name: "list_issues",
        arguments: {},
      }, 4);
      const listed = JSON.parse(listResponse.result.content[0].text);
      expect(listed.issues.length).toBe(1);
      expect(listed.total).toBe(1);
      expect(listed.issues[0].title).toBe("Integration test issue");

      // Invalid tool name
      const invalidResponse = await sendJsonRpc(proc, "tools/call", {
        name: "nonexistent_tool",
        arguments: {},
      }, 5);
      expect(invalidResponse.result.isError).toBe(true);
    } finally {
      proc.stdin.end();
      await proc.exited;
    }
  }, 15000);
});
