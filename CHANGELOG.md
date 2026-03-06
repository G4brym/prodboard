# prodboard

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
