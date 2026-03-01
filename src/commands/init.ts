import * as fs from "fs";
import * as path from "path";
import { PRODBOARD_DIR } from "../config.ts";
import { getDb, runMigrations } from "../db.ts";

function resolveTemplatePath(name: string): string {
  return path.resolve(import.meta.dir, "../../templates", name);
}

function resolveSchemaPath(): string {
  return path.resolve(import.meta.dir, "../../config.schema.json");
}

export async function init(args: string[], dirOverride?: string): Promise<void> {
  const prodboardDir = dirOverride ?? PRODBOARD_DIR;
  const logsDir = path.join(prodboardDir, "logs");
  const claudeMdFlag = args.includes("--claude-md");

  // Create directories
  if (!fs.existsSync(prodboardDir)) {
    fs.mkdirSync(prodboardDir, { recursive: true });
    console.log(`Created ${prodboardDir}/`);
  }
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log(`Created ${logsDir}/`);
  }

  // Initialize database
  const dbPath = path.join(prodboardDir, "db.sqlite");
  const db = getDb(dbPath);
  runMigrations(db);
  db.close();
  try { fs.chmodSync(dbPath, 0o600); } catch {}
  try { fs.chmodSync(logsDir, 0o700); } catch {}
  console.log("Database initialized.");

  // Config file — only write if not exists (user may have edited)
  const configDest = path.join(prodboardDir, "config.jsonc");
  if (!fs.existsSync(configDest)) {
    const configSrc = resolveTemplatePath("config.jsonc");
    fs.copyFileSync(configSrc, configDest);
    console.log("Created config.jsonc");
  } else {
    console.log("config.jsonc already exists, skipping.");
  }

  // Schema — always overwrite (package-managed)
  const schemaDest = path.join(prodboardDir, "config.schema.json");
  const schemaSrc = resolveSchemaPath();
  fs.copyFileSync(schemaSrc, schemaDest);
  console.log("Updated config.schema.json");

  // MCP config — always overwrite
  const mcpDest = path.join(prodboardDir, "mcp.json");
  const mcpSrc = resolveTemplatePath("mcp.json");
  fs.copyFileSync(mcpSrc, mcpDest);
  console.log("Updated mcp.json");

  // System prompts — always overwrite
  const spDest = path.join(prodboardDir, "system-prompt.md");
  const spSrc = resolveTemplatePath("system-prompt.md");
  fs.copyFileSync(spSrc, spDest);

  const spNogitDest = path.join(prodboardDir, "system-prompt-nogit.md");
  const spNogitSrc = resolveTemplatePath("system-prompt-nogit.md");
  fs.copyFileSync(spNogitSrc, spNogitDest);
  console.log("Updated system prompts.");

  // CLAUDE.md — only if --claude-md flag and not exists
  if (claudeMdFlag) {
    const claudeMdDest = path.join(process.cwd(), "CLAUDE.md");
    if (!fs.existsSync(claudeMdDest)) {
      const claudeMdSrc = resolveTemplatePath("CLAUDE.md");
      fs.copyFileSync(claudeMdSrc, claudeMdDest);
      console.log("Created CLAUDE.md in current directory.");
    } else {
      console.log("CLAUDE.md already exists, skipping.");
    }
  }

  console.log("\nprodboard initialized successfully!");
}
