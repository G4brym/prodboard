# prodboard — Roadmap

This document tracks remaining work, bug fixes, and enhancements needed before and after the first stable release.

---

## 1. Fix Critical Bugs

### 1.1 Template Variables Hardcoded to Zero in Scheduler

**File:** `src/scheduler.ts` lines 116–121

The `ExecutionManager.executeRun()` builds a `TemplateContext` with `todoCount: 0` and `inProgressCount: 0` instead of reading actual counts from the database. The `buildBoardSummaryLine()` call above it already queries the DB, but the counts are discarded. Fix: use `buildTemplateContext(db, scheduleName)` from `src/templates.ts` which already does this correctly.

```typescript
// Before (broken):
resolvedPrompt = resolveTemplate(schedule.prompt, {
  boardSummary: summaryLine,
  todoCount: 0,
  inProgressCount: 0,
  ...
});

// After (fixed):
const context = buildTemplateContext(this.db, schedule.name);
resolvedPrompt = resolveTemplate(schedule.prompt, context);
```

### 1.2 Confirmation Prompt in `rm` Command Does Not Wait for Input

**File:** `src/commands/issues.ts`

The `rm` command prints "Are you sure?" but then immediately calls `deleteIssue()` without reading any input. Same issue exists in `src/commands/schedules.ts` for `scheduleRm`. Fix: use `process.stdin` to read a line and check for "y"/"yes" before proceeding, or require `--force` flag for non-interactive use.

### 1.3 JSON Parse Crash Risk in MCP Tool Handlers

**File:** `src/mcp.ts`

Several MCP tool handlers pass user input directly to `JSON.parse()` without try/catch (e.g., parsing `allowed_tools` string in `handleCreateSchedule`). A malformed JSON string will crash the handler with an unhandled error. Wrap all `JSON.parse()` calls in try/catch and return a descriptive MCP error.

---

## 2. Fix High-Priority Issues

### 2.1 Add Missing package.json Metadata for npm Publishing

**File:** `package.json`

Add the following fields required for a proper npm listing:
- `description`: "Self-hosted, CLI-first issue tracker and cron scheduler for AI coding agents"
- `license`: "MIT" (and create a `LICENSE` file)
- `repository`: `{ "type": "git", "url": "https://github.com/<owner>/prodboard" }`
- `keywords`: `["cli", "issue-tracker", "mcp", "ai-agents", "scheduler", "cron", "sqlite"]`
- `author`: your name/org
- `homepage`: link to README or docs

### 2.2 Integrate Logger into Daemon and Scheduler

**Files:** `src/scheduler.ts`, `src/commands/daemon.ts`

The `Logger` class in `src/logger.ts` is fully implemented but never imported or used anywhere. The daemon uses `console.error()` for all logging. Replace `console.error()` calls with structured logger calls:
- `Daemon.start()` → `logger.info("Daemon started", { pid: process.pid })`
- `CronLoop.tick()` — log schedule evaluations at `debug` level, fires at `info` level
- `ExecutionManager.executeRun()` — log run start/end/error at `info`/`error` levels
- `CleanupWorker.cleanup()` — log pruned count at `info` level

### 2.3 Race Condition in Concurrent Run Check

**File:** `src/scheduler.ts` lines 266–267

The `CronLoop.tick()` method checks `getRunningRuns(this.db).length` then creates a run in two separate statements. Between the check and the create, another tick could sneak in. Fix: wrap the check + create in a SQLite transaction, or use a simple in-memory counter that increments before spawning and decrements on completion.

### 2.4 MCP Error Handling for Invalid Inputs

**File:** `src/mcp.ts`

The top-level `CallToolRequestSchema` handler catches errors but doesn't distinguish between "not found" errors and validation errors. Map specific error types:
- `Not found` → MCP error code `-32602` (invalid params)
- `Ambiguous prefix` → MCP error code `-32602`
- Validation errors → MCP error code `-32602` with valid values in `data`
- SQLite errors → MCP error code `-32603` (internal error)

---

## 3. Improve Test Coverage

### 3.1 End-to-End CLI Smoke Test

**File:** `tests/e2e.test.ts` (new)

Add a full round-trip test that exercises the real CLI binary:
```
init → add → ls → show → edit → mv → comment → comments → rm
```
Spawn `bun run bin/prodboard.ts` as a subprocess for each command. Use a temporary `HOME` directory so the test doesn't touch the real `~/.prodboard/`.

### 3.2 MCP Resource Handler Tests

Currently there are no tests for the `prodboard://issues` and `prodboard://schedules` resource handlers. Add unit tests that verify the returned data shape and content.

### 3.3 Edge Case Coverage

- `listIssues` with multiple status filters simultaneously
- `getIssueByPrefix` when the prefix itself is a valid full ID
- `buildInvocation` with all optional schedule fields set
- `CronLoop.tick()` when `shouldFire` throws for a malformed cron stored in DB
- Cron field combinations: `1-5/2` (range with step), `0 0 29 2 *` (Feb 29)

---

## 4. Polish CLI Experience

### 4.1 Add Color to Status Display

Apply consistent colors to issue statuses across all CLI output:
- `todo` → default/white
- `in-progress` → yellow
- `review` → cyan
- `done` → green
- `archived` → dim/gray

### 4.2 Add `--verbose` / `--quiet` Flags

- `--verbose` (`-v`): Show extra details (timestamps in `ls`, full descriptions)
- `--quiet` (`-q`): Only output IDs or counts (useful for scripting)

### 4.3 Config Validation on Load

**File:** `src/config.ts`

Validate loaded config against `config.schema.json` at startup. Currently the schema file exists but is never used for validation. Use a lightweight JSON Schema validator or manual checks for critical fields (valid status names, positive integers for limits, valid cron expressions in daemon defaults).

### 4.4 Shell Completions

Generate shell completion scripts for bash, zsh, and fish. Can be triggered with `prodboard completions <shell>`. Output a completion script that handles:
- Top-level commands and subcommands
- Flag names with descriptions
- Status values from config for `--status` flags

---

## 5. npm Publishing with Changesets

### 5.1 Set Up Changesets

Install and configure `@changesets/cli` for version management and changelog generation:
- `bun add -D @changesets/cli`
- `bunx changeset init` to create `.changeset/` directory and config
- Add `changeset` and `changeset:version` scripts to `package.json`

### 5.2 Changesets Workflow

For each release:
1. Run `bunx changeset` to describe changes (patch/minor/major)
2. Commit the changeset file
3. Run `bunx changeset version` to bump version + update CHANGELOG.md
4. Commit the version bump
5. `npm publish` or automated via CI

### 5.3 Configure Changesets for Bun

In `.changeset/config.json`, set:
- `"access": "public"` for public npm package
- `"baseBranch": "main"`
- `"changelog": "@changesets/cli/changelog"` for default changelog format

---

## 6. GitHub Release Automation

### 6.1 CI Workflow: Test on Push

**File:** `.github/workflows/ci.yml`

```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test
      - run: bun x tsc --noEmit
```

### 6.2 CI Workflow: Release on Version Tag

**File:** `.github/workflows/release.yml`

Triggered when a version tag (`v*`) is pushed. Steps:
1. Checkout code
2. Set up Bun
3. Install dependencies
4. Run tests (gate the release)
5. Publish to npm via `npm publish` (using `NPM_TOKEN` secret)
6. Create a GitHub Release using `gh release create` with auto-generated notes
7. Attach any relevant artifacts

### 6.3 Release Script

**File:** `scripts/release.sh`

A local helper script that automates the release flow:
```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Ensure clean working tree
# 2. Run tests
# 3. Run changeset version (bumps version, updates changelog)
# 4. Commit version bump
# 5. Tag with version from package.json
# 6. Push commit + tag (triggers release workflow)
```

---

## 7. Documentation Improvements

### 7.1 Man Page Generation

Generate a man page from the README or a dedicated source file. Install it to the correct location so `man prodboard` works after global install.

### 7.2 `--help` Improvements

Each command and subcommand should show detailed help when `--help` is passed, including:
- Synopsis with all flags
- Description of each flag
- Examples

Currently `--help` only shows the top-level command list.

### 7.3 Inline Config Documentation

The `config.jsonc` template should have comments explaining every option. Currently it has the structure but some options lack explanatory comments.

---

## 8. Future Features

### 8.1 Web Dashboard

A minimal read-only web UI served by the daemon (optional):
- Board view of issues by status (kanban-style columns)
- Schedule list with last run status
- Run history with expandable stdout/stderr
- Served on `localhost:<port>`, configurable in `config.jsonc`

### 8.2 Webhook / Notification Support

Fire webhooks or send notifications on events:
- Schedule run completes (success or failure)
- Issue status changes
- Configurable per-schedule: Slack webhook, Discord webhook, email (via sendmail)

### 8.3 Multi-Agent Orchestration

Allow schedules to define agent pipelines:
- Sequential: Agent A finishes → Agent B starts with context from A
- Parallel: Multiple agents work on different issues simultaneously
- Reviewer: One agent reviews another agent's work before marking done

### 8.4 Import/Export

- `prodboard export` — dump all issues, comments, schedules to JSON or YAML
- `prodboard import` — restore from export file
- Useful for migration, backup, and sharing project boards

### 8.5 Issue Templates

Predefined issue templates (e.g., "Bug Report", "Feature Request") with pre-filled fields:
- `prodboard add --template bug "Title here"`
- Templates stored in `~/.prodboard/templates/` or in the project repo
