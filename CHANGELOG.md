# prodboard

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
