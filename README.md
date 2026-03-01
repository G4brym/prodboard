# prodboard

Give Claude Code a persistent task board and a cron scheduler so it can manage work across sessions.

**The problem:** Claude Code loses context between sessions. It can't remember what tasks exist, what's in progress, or what to work on next. There's no way to schedule it to run recurring jobs like daily triage or nightly CI.

**The solution:** prodboard is a local issue tracker backed by SQLite that Claude Code can read and write through MCP tools. It also includes a cron daemon that spawns Claude Code on a schedule to work through tasks autonomously.

```
You (CLI)  ──┐
              ├──▶  SQLite DB  ◀──  MCP Server  ◀──  Claude Code
Cron Daemon ──┘
```

## What You Get

- **An issue board Claude Code can use** — Claude reads, creates, updates, and completes issues via MCP tools during any session
- **Scheduled Claude Code runs** — Define cron jobs that spawn Claude Code to triage issues, run maintenance, or work through the backlog
- **A CLI you can use too** — Same board, human-friendly commands. Add issues, check status, review what Claude did
- **Everything local** — Single SQLite file at `~/.prodboard/db.sqlite`. No servers, no accounts, no cloud

## Quick Start

```bash
# Install
bun install -g prodboard

# Initialize
prodboard init

# Connect Claude Code to the board
claude mcp add prodboard -- bunx prodboard mcp
```

That's it. Open Claude Code and start talking to it:

## Things You Can Say to Claude Code

Once connected, you can manage your board entirely through conversation:

### Setting Up Cron Jobs

```
"Every hour, tail the nginx access and error logs. If you see
 anything unusual — spikes in 5xx errors, suspicious request
 patterns, or unexpected traffic — create a new issue to investigate"

"Every 2 hours, pick up the next todo issue and try to fix it.
 Open a PR with your changes, comment the PR link on the issue,
 and move the issue to review"

"Every 2 hours, pick up the next issue in review. Check out the
 PR, verify the code is correct and tests pass. If everything
 looks good, merge it. If not, add a review comment on the PR
 explaining what needs to change and move the issue back to todo"

"Create a cron job that runs every 6 hours to check for
 and fix any TypeScript type errors in the project"

"Set up a daily schedule at 9 AM on weekdays to review
 the board and work on the highest priority task"

"Add a cron job that runs every night at midnight to
 run the test suite and create issues for any failures"

"Schedule a weekly cleanup every Friday at 5 PM to
 archive all done issues and summarize what was accomplished"

"Create a schedule that runs every 30 minutes to monitor
 the API health endpoint and create an issue if it's down"
```

### Managing Tasks

```
"Add a task to fix the authentication timeout bug in the API"

"What's on the board right now?"

"Pick up the next task and start working on it"

"Mark the login bug as done, I fixed it manually"

"Create an issue to refactor the database layer, mark it as todo"

"Show me all in-progress issues"

"Add a comment to the auth bug — we need to check the session TTL"
```

### Reviewing Activity

```
"Show me what the last cron run did"

"What tasks did you complete this week?"

"Show the schedule stats for the daily triage job"
```

Claude Code handles all the MCP tool calls behind the scenes — you just talk to it naturally.

## Adding Tasks from the CLI

You can also manage the board directly:

```bash
prodboard add "Fix login bug" -d "OAuth callback URL is wrong" -s todo
prodboard add "Add dark mode" -s todo
prodboard add "Write API tests" -s todo
prodboard ls
```

### Starting the Scheduler

```bash
# Start the cron daemon (keeps running in foreground)
prodboard daemon

# Or preview what's scheduled without running anything
prodboard daemon --dry-run
```

## CLI Reference

### Issues

```bash
prodboard add "Fix bug" -d "description" -s todo    # Create
prodboard ls                                         # List (table)
prodboard ls --status todo --status in-progress      # Filter by status
prodboard ls --search "login" --json                 # Search + JSON output
prodboard show <id>                                  # Details + comments
prodboard edit <id> --title "New title" -s review    # Update fields
prodboard mv <id> done                               # Change status
prodboard rm <id> --force                            # Delete
```

### Comments

```bash
prodboard comment <id> "Looking into this"           # Add comment
prodboard comment <id> "Fixed" --author claude       # With author
prodboard comments <id>                              # List comments
```

### Schedules

```bash
prodboard schedule add --name "job" --cron "0 9 * * *" --prompt "Do X"
prodboard schedule ls                                # List schedules
prodboard schedule edit <id> --cron "0 10 * * *"     # Edit
prodboard schedule enable <id>                       # Enable
prodboard schedule disable <id>                      # Disable
prodboard schedule rm <id> --force                   # Delete
prodboard schedule run <id>                          # Run immediately
prodboard schedule logs                              # Run history
prodboard schedule stats --days 7                    # Statistics
```

### Daemon

```bash
prodboard daemon                                     # Start (foreground)
prodboard daemon --dry-run                           # Preview schedules
prodboard daemon status                              # Check if running
```

### Other

```bash
prodboard config                                     # Show configuration
prodboard version                                    # Show version
```

IDs support prefix matching — use `a3f9` instead of the full `a3f9b2c1d4e5f678`.

## MCP Tools

These are the tools Claude Code sees when connected to the board:

| Tool | What Claude Uses It For |
|------|------------------------|
| `board_summary` | See issue counts and recent activity |
| `list_issues` | Browse issues with filters |
| `get_issue` | Read full issue details and comments |
| `create_issue` | Log a new task or bug |
| `update_issue` | Change title, description, or status |
| `delete_issue` | Remove an issue |
| `add_comment` | Leave notes on issues (default author: "claude") |
| `pick_next_issue` | Claim the oldest todo, move to in-progress |
| `complete_issue` | Mark done with an optional summary comment |
| `list_schedules` | See scheduled jobs |
| `create_schedule` | Set up a new cron job |
| `update_schedule` | Modify a schedule |
| `delete_schedule` | Remove a schedule |
| `list_runs` | Check run history and results |

MCP resources: `prodboard://issues` (board summary) and `prodboard://schedules` (active schedules).

## Configuration

Config file: `~/.prodboard/config.jsonc`

```jsonc
{
  "general": {
    "statuses": ["todo", "in-progress", "review", "done", "archived"],
    "defaultStatus": "todo",
    "idPrefix": ""
  },
  "daemon": {
    "maxConcurrentRuns": 2,
    "maxTurns": 50,
    "hardMaxTurns": 200,
    "runTimeoutSeconds": 1800,
    "runRetentionDays": 30,
    "logLevel": "info",
    "useWorktrees": "auto"
  }
}
```

## Scheduler Details

### Cron Syntax

Standard 5-field cron:

```
┌───────────── minute (0-59)
│ ┌─────────── hour (0-23)
│ │ ┌───────── day of month (1-31)
│ │ │ ┌─────── month (1-12)
│ │ │ │ ┌───── day of week (0-6, Sun=0)
│ │ │ │ │
* * * * *
```

| Expression | Meaning |
|-----------|---------|
| `0 9 * * 1-5` | Weekdays at 9 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 0 1 * *` | First of every month |
| `0 9,17 * * *` | 9 AM and 5 PM daily |

### Template Variables

Use in schedule prompts to inject board context:

| Variable | Value |
|----------|-------|
| `{{board_summary}}` | "3 todo, 1 in-progress, 0 review" |
| `{{todo_count}}` | Number of todo issues |
| `{{in_progress_count}}` | Number of in-progress issues |
| `{{datetime}}` | Current ISO 8601 timestamp |
| `{{schedule_name}}` | Name of the schedule |

```bash
prodboard schedule add \
  --name "morning-standup" \
  --cron "0 9 * * 1-5" \
  --prompt "Board: {{board_summary}}. Pick the next todo and work on it."
```

### Running as a systemd Service

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
sudo systemctl enable --now prodboard
```

## Troubleshooting

**"prodboard is not initialized"** — Run `prodboard init`.

**MCP not connecting** — Verify `claude mcp add prodboard -- bunx prodboard mcp` was run, or check `~/.prodboard/mcp.json`.

**Daemon not starting** — Check `~/.prodboard/logs/daemon.log`. Make sure `claude` CLI is installed and `ANTHROPIC_API_KEY` is set.

**Stale PID file** — The daemon crashed. Run `prodboard daemon` to restart (auto-cleans stale PIDs).

## Development

```bash
bun install
bun test
bun run typecheck
```

## License

MIT
