# prodboard

A self-hosted, CLI-first issue tracker and cron scheduler for AI coding agents.

## Overview

prodboard provides three interfaces for managing issues and scheduled AI tasks:

- **CLI** — Human-friendly commands for issue tracking and schedule management
- **MCP Server** — Model Context Protocol server for AI agent integration
- **Scheduler Daemon** — Cron-based task scheduler that invokes Claude on a schedule

All state lives in a single SQLite database at `~/.prodboard/db.sqlite`.

## Quick Start

### Install

```bash
bun install -g prodboard
```

### Initialize

```bash
prodboard init
```

This creates `~/.prodboard/` with the database, config, and generated files.

### Connect to Claude

```bash
claude mcp add prodboard -- bunx prodboard mcp
```

Or copy the generated MCP config:

```bash
cat ~/.prodboard/mcp.json
```

### Add the CLAUDE.md (optional)

```bash
prodboard init --claude-md
```

## CLI Reference

### Issue Management

```bash
# Create an issue
prodboard add "Fix login bug" -d "SameSite cookie issue on Safari" -s todo

# List issues
prodboard ls                        # All non-archived issues
prodboard ls --status todo          # Filter by status
prodboard ls --search "login"       # Search title/description
prodboard ls --json                 # JSON output
prodboard ls --all                  # Include archived

# Show issue details
prodboard show <id>                 # Full ID or unique prefix
prodboard show a3f9                 # Prefix match

# Edit an issue
prodboard edit <id> --title "New title"
prodboard edit <id> --status review
prodboard edit <id> -d "Updated description"

# Move issue status
prodboard mv <id> done

# Delete an issue
prodboard rm <id> --force

# Comments
prodboard comment <id> "Looking into this"
prodboard comment <id> "Fixed it" --author claude
prodboard comments <id>
prodboard comments <id> --json
```

### Schedule Management

```bash
# Create a schedule
prodboard schedule add \
  --name "daily-triage" \
  --cron "0 9 * * 1-5" \
  --prompt "Review the board and triage new issues"

# List schedules
prodboard schedule ls
prodboard schedule ls --all --json

# Edit a schedule
prodboard schedule edit <id> --cron "0 10 * * *"

# Enable/disable
prodboard schedule enable <id>
prodboard schedule disable <id>

# Delete
prodboard schedule rm <id> --force

# Run immediately (foreground)
prodboard schedule run <id>

# View run history
prodboard schedule logs
prodboard schedule logs --schedule <id> --limit 10

# View statistics
prodboard schedule stats
prodboard schedule stats --schedule <id> --days 7
```

### Daemon

```bash
# Start daemon (foreground, for systemd)
prodboard daemon

# Dry run (show schedules without executing)
prodboard daemon --dry-run

# Check daemon status
prodboard daemon status
```

### Other

```bash
prodboard config    # Show current configuration
prodboard version   # Show version
prodboard help      # Show help
```

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `board_summary` | Overview of issues by status, recent issues |
| `list_issues` | List issues with optional filters |
| `get_issue` | Get full issue details with comments |
| `create_issue` | Create a new issue |
| `update_issue` | Update issue fields |
| `delete_issue` | Delete an issue |
| `add_comment` | Add a comment (default author: claude) |
| `pick_next_issue` | Claim next todo, move to in-progress |
| `complete_issue` | Mark done with optional comment |
| `list_schedules` | List scheduled tasks |
| `create_schedule` | Create a scheduled task |
| `update_schedule` | Update a scheduled task |
| `delete_schedule` | Delete a scheduled task |
| `list_runs` | View run history |

### MCP Resources

| URI | Description |
|-----|-------------|
| `prodboard://issues` | Board summary (same as board_summary) |
| `prodboard://schedules` | Active schedules with next run times |

## Configuration

Config file: `~/.prodboard/config.jsonc` (JSONC format — comments allowed)

```jsonc
{
  "general": {
    // Issue statuses in display order
    "statuses": ["todo", "in-progress", "review", "done", "archived"],
    // Default status for new issues
    "defaultStatus": "todo",
    // Optional prefix for issue IDs
    "idPrefix": ""
  },
  "daemon": {
    // Max concurrent scheduled runs
    "maxConcurrentRuns": 2,
    // Default max turns for Claude
    "maxTurns": 50,
    // Absolute max (cannot be overridden)
    "hardMaxTurns": 200,
    // Run timeout in seconds
    "runTimeoutSeconds": 1800,
    // Days to keep run history
    "runRetentionDays": 30,
    // Log level: debug, info, warn, error
    "logLevel": "info",
    // Worktree usage: auto, always, never
    "useWorktrees": "auto"
  }
}
```

## Scheduler Guide

### Cron Syntax

Standard 5-field cron expressions:

```
minute (0-59)
hour (0-23)
day of month (1-31)
month (1-12)
day of week (0-6, 0=Sunday)
```

Examples:
- `0 9 * * 1-5` — Weekdays at 9:00 AM
- `*/15 * * * *` — Every 15 minutes
- `0 0 1 * *` — First of every month at midnight
- `0 9,17 * * *` — 9 AM and 5 PM daily

### Template Variables

Use in schedule prompts:

| Variable | Description |
|----------|-------------|
| `{{board_summary}}` | Compact summary: "3 todo, 1 in-progress, 0 review" |
| `{{todo_count}}` | Number of todo issues |
| `{{in_progress_count}}` | Number of in-progress issues |
| `{{datetime}}` | Current ISO 8601 timestamp |
| `{{schedule_name}}` | Name of the schedule |

Example:

```bash
prodboard schedule add \
  --name "morning-standup" \
  --cron "0 9 * * 1-5" \
  --prompt "Board status: {{board_summary}}. Pick and work on the next todo issue."
```

## Running as a Service

### systemd

Create `/etc/systemd/system/prodboard.service`:

```ini
[Unit]
Description=prodboard scheduler daemon
After=network.target

[Service]
Type=simple
User=your-user
ExecStart=/usr/local/bin/bun run prodboard daemon
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable prodboard
sudo systemctl start prodboard
sudo systemctl status prodboard
```

## Troubleshooting

**"prodboard is not initialized"**
Run `prodboard init` to create `~/.prodboard/`.

**MCP server not connecting**
Check that `~/.prodboard/mcp.json` exists and the path to prodboard is correct.

**Daemon not starting**
Check `~/.prodboard/logs/daemon.log` for errors. Ensure claude CLI is installed and accessible.

**Stale PID file**
If `prodboard daemon status` shows "stale PID file", the daemon crashed. It will auto-clean the PID file. Run `prodboard daemon` to restart.

## Development

```bash
bun install
bun test
bun run typecheck
```

## License

MIT
