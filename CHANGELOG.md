# prodboard

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
