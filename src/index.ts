import { existsSync } from "fs";
import { PRODBOARD_DIR } from "./config.ts";

export class NotInitializedError extends Error {
  constructor() {
    super(`prodboard is not initialized. Run 'prodboard init' first.`);
    this.name = "NotInitializedError";
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

function ensureInitialized(): void {
  if (!existsSync(PRODBOARD_DIR)) {
    throw new NotInitializedError();
  }
}

export async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const command = args[0];

  if (command === "--version" || command === "version") {
    const pkg = await import("../package.json");
    console.log(pkg.version);
    return;
  }

  if (command === "--help" || command === "help" || !command) {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case "init": {
        const { init } = await import("./commands/init.ts");
        await init(args.slice(1));
        break;
      }
      case "add": {
        ensureInitialized();
        const { add } = await import("./commands/issues.ts");
        await add(args.slice(1));
        break;
      }
      case "ls": {
        ensureInitialized();
        const { ls } = await import("./commands/issues.ts");
        await ls(args.slice(1));
        break;
      }
      case "show": {
        ensureInitialized();
        const { show } = await import("./commands/issues.ts");
        await show(args.slice(1));
        break;
      }
      case "edit": {
        ensureInitialized();
        const { edit } = await import("./commands/issues.ts");
        await edit(args.slice(1));
        break;
      }
      case "mv": {
        ensureInitialized();
        const { mv } = await import("./commands/issues.ts");
        await mv(args.slice(1));
        break;
      }
      case "rm": {
        ensureInitialized();
        const { rm } = await import("./commands/issues.ts");
        await rm(args.slice(1));
        break;
      }
      case "comment": {
        ensureInitialized();
        const { comment } = await import("./commands/comments.ts");
        await comment(args.slice(1));
        break;
      }
      case "comments": {
        ensureInitialized();
        const { comments } = await import("./commands/comments.ts");
        await comments(args.slice(1));
        break;
      }
      case "schedule": {
        ensureInitialized();
        const sub = args[1];
        const subArgs = args.slice(2);
        const schedMod = await import("./commands/schedules.ts");
        switch (sub) {
          case "add":
            await schedMod.scheduleAdd(subArgs);
            break;
          case "ls":
            await schedMod.scheduleLs(subArgs);
            break;
          case "edit":
            await schedMod.scheduleEdit(subArgs);
            break;
          case "enable":
            await schedMod.scheduleEnable(subArgs);
            break;
          case "disable":
            await schedMod.scheduleDisable(subArgs);
            break;
          case "rm":
            await schedMod.scheduleRm(subArgs);
            break;
          case "logs":
            await schedMod.scheduleLogs(subArgs);
            break;
          case "run":
            await schedMod.scheduleRun(subArgs);
            break;
          case "stats":
            await schedMod.scheduleStats(subArgs);
            break;
          default:
            console.error(`Unknown schedule subcommand: ${sub}`);
            console.error("Available: add, ls, edit, enable, disable, rm, logs, run, stats");
            process.exit(1);
        }
        break;
      }
      case "daemon": {
        ensureInitialized();
        const sub = args[1];
        const daemonMod = await import("./commands/daemon.ts");
        if (sub === "status") {
          await daemonMod.daemonStatus(args.slice(2));
        } else if (sub === "restart") {
          await daemonMod.daemonRestart(args.slice(2));
        } else {
          await daemonMod.daemonStart(args.slice(1));
        }
        break;
      }
      case "install": {
        ensureInitialized();
        const { install } = await import("./commands/install.ts");
        await install(args.slice(1));
        break;
      }
      case "uninstall": {
        const { uninstall } = await import("./commands/install.ts");
        await uninstall(args.slice(1));
        break;
      }
      case "config": {
        ensureInitialized();
        const { loadConfig } = await import("./config.ts");
        const config = loadConfig();
        console.log(JSON.stringify(config, null, 2));
        break;
      }
      case "mcp": {
        const { startMcpServer } = await import("./mcp.ts");
        await startMcpServer();
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err: any) {
    if (err instanceof NotInitializedError) {
      console.error(err.message);
      process.exit(3);
    }
    if (err instanceof DatabaseError) {
      console.error(`Database error: ${err.message}`);
      process.exit(2);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`prodboard — CLI-first issue tracker for AI coding agents

Usage: prodboard <command> [options]

Commands:
  init              Initialize prodboard (~/.prodboard/)
  add <title>       Create a new issue
  ls                List issues
  show <id>         Show issue details
  edit <id>         Edit an issue
  mv <id> <status>  Change issue status
  rm <id>           Delete an issue
  comment <id>      Add a comment to an issue
  comments <id>     List comments for an issue
  schedule <sub>    Manage scheduled tasks
  daemon            Start the scheduler daemon
  daemon restart    Restart the daemon (systemd)
  daemon status     Show daemon status
  install           Install systemd service
  uninstall         Remove systemd service
  config            Show configuration
  mcp               Start MCP server (stdio)
  version           Show version
  help              Show this help

Schedule subcommands:
  schedule add      Create a schedule
  schedule ls       List schedules
  schedule edit     Edit a schedule
  schedule enable   Enable a schedule
  schedule disable  Disable a schedule
  schedule rm       Delete a schedule
  schedule logs     Show run history
  schedule run      Run a schedule immediately
  schedule stats    Show schedule statistics

Options:
  --json            Output in JSON format
  --help            Show help for a command
  --version         Show version`);
}
