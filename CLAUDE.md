# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is prodboard

A self-hosted, CLI-first issue tracker and cron scheduler for AI coding agents. It exposes a SQLite-backed issue board via both a CLI and an MCP server, and includes a daemon that spawns Claude Code on cron schedules to work through tasks autonomously.

## Commands

```bash
bun install          # Install dependencies
bun test             # Run all tests (bun's built-in test runner)
bun run typecheck    # Type check (bun x tsc --noEmit)
bun run dev          # Run CLI entrypoint (bin/prodboard.ts)
```

Run a single test file:
```bash
bun test tests/mcp.test.ts
```

## Architecture

Single-package Bun/TypeScript project (no monorepo). Runtime is Bun — uses `bun:sqlite` for the database and Bun's test runner.

### Entrypoint & CLI

- `bin/prodboard.ts` — shebang entrypoint, calls `main()` from `src/index.ts`
- `src/index.ts` — CLI router: parses `Bun.argv`, dispatches to command handlers via lazy `import()`. Guards most commands behind `ensureInitialized()` (checks `~/.prodboard/` exists)

### Commands (`src/commands/`)

Each file exports handler functions that receive `args: string[]` and parse their own flags:
- `issues.ts` — `add`, `ls`, `show`, `edit`, `mv`, `rm`
- `comments.ts` — `comment`, `comments`
- `schedules.ts` — `scheduleAdd`, `scheduleLs`, `scheduleEdit`, `scheduleEnable`, `scheduleDisable`, `scheduleRm`, `scheduleLogs`, `scheduleRun`, `scheduleStats`
- `daemon.ts` — `daemonStart`, `daemonStatus`
- `init.ts` — scaffolds `~/.prodboard/` with config, DB, templates
- `install.ts` — systemd user service management

### Data Layer

- `src/db.ts` — SQLite connection (`bun:sqlite`), migration system. DB path: `~/.prodboard/db.sqlite`. Tables: `issues`, `comments`, `schedules`, `runs`, `_migrations`
- `src/queries/` — pure query functions that take a `Database` and return typed results:
  - `issues.ts` — CRUD + prefix-matching ID resolution (`getIssueByPrefix`)
  - `comments.ts` — comment CRUD
  - `schedules.ts` — schedule CRUD + prefix-matching
  - `runs.ts` — run tracking, status updates, pruning
- `src/types.ts` — shared interfaces: `Config`, `Issue`, `Comment`, `Schedule`, `Run`, `EnvironmentInfo`
- `src/config.ts` — loads `~/.prodboard/config.jsonc` (JSONC with custom comment stripper), deep-merges with defaults. `PRODBOARD_DIR` constant is `~/.prodboard`

### MCP Server (`src/mcp.ts`)

Uses `@modelcontextprotocol/sdk` over stdio transport. Exposes 14 tools (issue CRUD, board_summary, pick_next_issue, complete_issue, schedule CRUD, list_runs) and 2 resources (`prodboard://issues`, `prodboard://schedules`). Handler functions are exported individually for testability. Auto-initializes on start if `~/.prodboard/` doesn't exist.

### Scheduler (`src/scheduler.ts`)

Four classes:
- `ExecutionManager` — spawns `claude` CLI as subprocess, streams stdout JSON events, tracks cost/tokens/tools in a `RingBuffer`, updates run records
- `CronLoop` — 30-second interval tick, evaluates `shouldFire()` per schedule, enforces concurrent run limit
- `CleanupWorker` — hourly pruning of old runs
- `Daemon` — orchestrates all three, manages PID file and graceful shutdown

### Supporting Modules

- `src/cron.ts` — cron expression parser and `shouldFire(expr, date)` evaluator (5-field standard cron)
- `src/templates.ts` — `{{variable}}` template resolution for schedule prompts (board_summary, todo_count, etc.)
- `src/invocation.ts` — builds the `claude` CLI command array based on schedule config and environment detection (git/worktree support)
- `src/format.ts` — CLI table formatting utilities
- `src/ids.ts` — ID generation (uses `crypto.randomUUID()`)
- `src/logger.ts` — structured logger class (file + console output)
- `src/confirm.ts` — CLI confirmation prompt helper

### Templates (`templates/`)

Files copied to `~/.prodboard/` during `init`:
- `config.jsonc` — default config
- `mcp.json` — MCP server registration for Claude Code
- `CLAUDE.md` — instructions for Claude Code sessions about prodboard workflow
- `system-prompt.md` / `system-prompt-nogit.md` — injected into scheduled Claude runs

## Testing

Tests use Bun's built-in test runner with `describe`/`test`/`expect`. Test helper `tests/helpers.ts` provides:
- `createTestDb()` — in-memory SQLite with migrations applied
- `createTestConfig()` — default config with optional overrides
- `createTempDir()` — temp dir with cleanup function
- `captureOutput()` — captures `console.log`/`console.error` during async execution

Tests create in-memory databases and don't touch `~/.prodboard/`. Temp test dirs matching `.tmp-test-*` are gitignored.

## Versioning

Uses [Changesets](https://github.com/changesets/changesets) for version management. `bunx changeset` to add a changeset, CI handles versioning PRs and npm publishing via the release workflow.
