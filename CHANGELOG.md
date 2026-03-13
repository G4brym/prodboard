# prodboard

## 0.5.0

### Minor Changes

- [#23](https://github.com/G4brym/prodboard/pull/23) [`146b3b5`](https://github.com/G4brym/prodboard/commit/146b3b5105ad127c3eb31f4e8c6ea19918329380) Thanks [@G4brym](https://github.com/G4brym)! - Optimize MCP list handlers: trim prompt from list_schedules, add get_schedule tool, exclude stderr_tail from list_runs defaults

## 0.4.0

### Minor Changes

- [#21](https://github.com/G4brym/prodboard/pull/21) [`761e8fc`](https://github.com/G4brym/prodboard/commit/761e8fce4cd370424903753952835f7a399730bb) Thanks [@G4brym](https://github.com/G4brym)! - Add per-schedule and global model selection for Claude and OpenCode agents

## 0.3.0

### Minor Changes

- [#17](https://github.com/G4brym/prodboard/pull/17) [`20f3860`](https://github.com/G4brym/prodboard/commit/20f38608b1a5a9d986bcf1d04d4dfb579fa7ec18) Thanks [@G4brym](https://github.com/G4brym)! - Add `trigger_schedule` MCP tool to manually trigger a schedule run

  Adds a new MCP tool that allows agents and users to trigger a schedule to run immediately without waiting for the cron interval. The run is started asynchronously and returns the run ID so callers can check status via `list_runs`. Disabled schedules are rejected, and the concurrent run limit is enforced.

### Patch Changes

- [#20](https://github.com/G4brym/prodboard/pull/20) [`53c5d4d`](https://github.com/G4brym/prodboard/commit/53c5d4d1ee7331e50f4b4cc5fb1aa8e37836967e) Thanks [@G4brym](https://github.com/G4brym)! - Fix schedules with identical cron patterns — all matching schedules now fire

  Snapshot the running-run count once before the tick loop instead of re-querying
  inside the loop. This prevents a run created for schedule A from counting against
  schedule B's concurrency check when both share the same cron expression.

## 0.2.3

### Patch Changes

- [#13](https://github.com/G4brym/prodboard/pull/13) [`5465723`](https://github.com/G4brym/prodboard/commit/54657238021a20fb0d5a4bb6e13a1b8eab026c31) Thanks [@G4brym](https://github.com/G4brym)! - Fix systemd service missing PATH environment variable

  The generated systemd service file only set `HOME` but not `PATH`, causing the daemon to run with a minimal default PATH. This meant tools like `claude` and `gh` installed in user-local directories (e.g. `~/.local/bin`) were not found, resulting in scheduled runs failing with exit code 127.

  The fix captures the current `PATH` at install time and includes it in the systemd service file.

- [`af1ff32`](https://github.com/G4brym/prodboard/commit/af1ff3291993e0720a4044220b84f8b048fef26e) Thanks [@G4brym](https://github.com/G4brym)! - Fix webui failing to load when prodboard is installed globally by adding `@jsxImportSource hono/jsx` pragma to all TSX files.

## 0.2.2

### Patch Changes

- [`62ef4b0`](https://github.com/G4brym/prodboard/commit/62ef4b0a1f6969e3d06f549635ebfd337b84403c) Thanks [@G4brym](https://github.com/G4brym)! - Show config warnings (tmux availability, webui dependencies) on every CLI command. Improved webui dependency messages with actionable install commands.

## 0.2.1

### Patch Changes

- [#9](https://github.com/G4brym/prodboard/pull/9) [`d418fc4`](https://github.com/G4brym/prodboard/commit/d418fc41b52e26789dd3b5be7f2dcdf9429ef287) Thanks [@G4brym](https://github.com/G4brym)! - Add `daemon restart` command with config validation and webui dependency checks. The `install` command now also validates config before proceeding. Invalid config values produce clear warnings with fix tips.

## 0.2.0

### Minor Changes

- [#6](https://github.com/G4brym/prodboard/pull/6) [`030c913`](https://github.com/G4brym/prodboard/commit/030c9136dc344e93616e0ef6014bab25d45b50d5) Thanks [@G4brym](https://github.com/G4brym)! - Add OpenCode support, prodboard-managed worktrees, tmux session wrapping, configurable base path, and web UI

## 0.1.3

### Patch Changes

- 79dd032: Auto-initialize prodboard when the MCP server starts, removing the need to run `prodboard init` separately

## 0.1.2

### Patch Changes

- a9f2241: Fix daemon failing immediately by adding `--verbose` flag required for `--output-format stream-json` in print mode

## 0.1.1

### Patch Changes

- 1aa4d25: Add `prodboard install` and `prodboard uninstall` commands to manage a user-level systemd service for the daemon

## 0.1.0

### Minor Changes

- dc917e9: Initial release of prodboard — a self-hosted, CLI-first issue tracker and cron scheduler for AI coding agents.

  Features:

  - Full CLI for issue tracking (add, ls, show, edit, mv, rm, comment)
  - MCP server with 14 tools for AI agent integration
  - Cron-based scheduler daemon for automated agent runs
  - SQLite-backed persistent storage
  - Configurable via JSONC config file
  - Template engine for schedule prompts with board context injection
