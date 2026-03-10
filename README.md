# prodboard

Give AI coding agents a persistent task board and a cron scheduler so they can manage work across sessions.

**The problem:** AI coding agents lose context between sessions. They can't remember what tasks exist, what's in progress, or what to work on next. There's no way to schedule them to run recurring jobs like daily triage or nightly CI.

**The solution:** prodboard is a local issue tracker backed by SQLite that agents can read and write through MCP tools. It includes a cron daemon that spawns agents on a schedule, with optional tmux session wrapping and git worktree isolation.

```
You (CLI)  ──┐
              ├──▶  SQLite DB  ◀──  MCP Server  ◀──  Claude Code / OpenCode
Cron Daemon ──┘         ▲
Web UI ─────────────────┘
```

## What You Get

- **An issue board your agent can use** — The agent reads, creates, updates, and completes issues via MCP tools during any session
- **Scheduled agent runs** — Define cron jobs that spawn your agent to triage issues, run maintenance, or work through the backlog
- **Multiple agent support** — Works with Claude Code (default) and OpenCode
- **tmux sessions** — Running agents are wrapped in tmux sessions you can attach to and watch live
- **Git worktree isolation** — Each scheduled run gets its own worktree so concurrent runs don't conflict
- **Web UI** — Optional browser-based kanban board for managing issues, schedules, and runs
- **A CLI you can use too** — Same board, human-friendly commands. Add issues, check status, review what the agent did
- **Everything local** — Single SQLite file at `~/.prodboard/db.sqlite`. No servers, no accounts, no cloud

## Quick Start

```bash
# Install
bun install -g prodboard

# Connect Claude Code to the board (auto-initializes on first use)
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
prodboard schedule add --name "fast" --cron "*/30 * * * *" --prompt "Do Y" --model claude-sonnet-4-6
prodboard schedule ls                                # List schedules
prodboard schedule edit <id> --cron "0 10 * * *"     # Edit
prodboard schedule edit <id> --model claude-opus-4-6 # Set model
prodboard schedule edit <id> --model ""              # Clear model override
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
prodboard daemon restart                             # Restart via systemd
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
| `trigger_schedule` | Trigger a schedule to run immediately |
| `list_runs` | Check run history and results |

MCP resources: `prodboard://issues` (board summary) and `prodboard://schedules` (active schedules).

## Supported Agents

prodboard works with multiple AI coding agents. Set `daemon.agent` in your config:

| Agent | Config value | Notes |
|-------|-------------|-------|
| **Claude Code** | `"claude"` (default) | Uses `claude` CLI with `--dangerously-skip-permissions` |
| **OpenCode** | `"opencode"` | Uses `opencode run` with JSON output. Prodboard auto-starts `opencode serve` if needed |

OpenCode-specific settings:

```jsonc
{
  "daemon": {
    "agent": "opencode",
    "opencode": {
      "serverUrl": null,   // auto-detect or override (e.g., "http://localhost:4096")
      "model": null,       // e.g., "anthropic/claude-sonnet-4-20250514"
      "agent": null        // opencode agent name
    }
  }
}
```

## Model Selection

You can control which model is used for scheduled runs at two levels:

**Global default** — Set `daemon.model` in your config to apply to all schedules:

```jsonc
{
  "daemon": {
    "model": "claude-sonnet-4-6"
  }
}
```

**Per-schedule override** — Set `--model` when creating or editing a schedule:

```bash
prodboard schedule add --name "triage" --cron "0 9 * * *" --prompt "Triage the board" --model claude-opus-4-6
prodboard schedule edit <id> --model claude-haiku-4-5-20251001
prodboard schedule edit <id> --model ""   # clear override, fall back to global
```

**Resolution order:** schedule `--model` > `daemon.model` > agent's built-in default. For OpenCode, `daemon.opencode.model` sits between the global `daemon.model` and the agent default.

Example model IDs:
- Claude Code: `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001`
- OpenCode: `anthropic/claude-sonnet-4-20250514`, etc.

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
    "agent": "claude",            // "claude" or "opencode"
    "model": null,                // default model for runs (null = agent's default)
    "basePath": null,             // base path for worktrees and runs (null = use schedule workdir)
    "useTmux": true,              // wrap agent runs in tmux sessions
    "maxConcurrentRuns": 2,
    "maxTurns": 50,
    "hardMaxTurns": 200,
    "runTimeoutSeconds": 1800,
    "runRetentionDays": 30,
    "logLevel": "info",
    "logMaxSizeMb": 10,           // max size per log file in MB
    "logMaxFiles": 5,             // max number of rotated log files
    "defaultAllowedTools": [...], // tools allowed for git-repo runs
    "nonGitDefaultAllowedTools": [...], // tools allowed for non-git runs
    "useWorktrees": "auto"        // "auto", "always", or "never"
  },
  "webui": {
    "enabled": false,             // enable the web UI
    "port": 3838,
    "hostname": "127.0.0.1",
    "password": null              // set a password to require login
  }
}
```

## Web UI

prodboard includes an optional browser-based interface for managing issues, schedules, and runs.

To enable it, set `webui.enabled` in your config:

```jsonc
{
  "webui": {
    "enabled": true,
    "port": 3838,
    "password": "your-secret"  // optional — null for no auth
  }
}
```

Start the daemon and open `http://127.0.0.1:3838`. The web UI provides:

- Kanban board with drag-and-drop issue management
- Schedule creation and editing
- Run monitoring with status, cost, and token usage
- Password protection when `password` is set

## tmux Sessions

When `daemon.useTmux` is `true` (the default) and tmux is installed, each agent run is wrapped in a detached tmux session. This lets you attach and watch the agent work in real time:

```bash
# List active prodboard sessions
tmux list-sessions | grep prodboard

# Attach to a running agent
tmux attach -t prodboard-<run-id-prefix>
```

The session name is `prodboard-` followed by the first 8 characters of the run ID (visible in `prodboard schedule logs`).

If tmux is not installed, runs fall back to direct process spawning with piped stdout. A warning is logged at daemon startup.

## Git Worktrees

prodboard creates isolated git worktrees for each scheduled run, so concurrent runs in the same repository don't conflict.

**Requirement:** You must set `daemon.basePath` in your config for worktrees to work. This tells prodboard where to create the `.worktrees/` directory. If `basePath` is `null` (the default), worktrees are disabled regardless of the `useWorktrees` setting.

```jsonc
{
  "daemon": {
    "basePath": "/home/you/my-project",  // required for worktrees
    "useWorktrees": "auto"
  }
}
```

| `useWorktrees` | Behavior |
|---------------|----------|
| `"auto"` (default) | Create worktrees when `basePath` is set, the directory is a git repo, and the schedule allows it |
| `"always"` | Always create worktrees (fails if directory is not a git repo) |
| `"never"` | Never create worktrees |

Worktrees are created under `<basePath>/.worktrees/<run-id>` on a branch named `prodboard/<run-id>`, and automatically cleaned up (directory + branch deleted) after the run completes.

Per-schedule control: set `use_worktree` to `false` on a schedule to skip worktree creation for that specific job.

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

```bash
# Install and start as a user-level systemd service (no sudo needed)
prodboard install

# Check status
systemctl --user status prodboard

# Remove the service
prodboard uninstall

# Reinstall (e.g. after updating prodboard)
prodboard install --force
```

## Troubleshooting

**"prodboard is not initialized"** — Run `prodboard init`.

**MCP not connecting** — Verify `claude mcp add prodboard -- bunx prodboard mcp` was run, or check `~/.prodboard/mcp.json`.

**Daemon not starting** — Check `~/.prodboard/logs/daemon.log`. Make sure your agent CLI is installed (`claude` or `opencode`) and `ANTHROPIC_API_KEY` is set.

**Stale PID file** — The daemon crashed. Run `prodboard daemon` to restart (auto-cleans stale PIDs).

**tmux not working** — Install tmux (`apt install tmux` / `brew install tmux`). The daemon falls back to direct spawning without it.

**Worktree errors** — Ensure the working directory is a git repo with at least one commit. Set `useWorktrees: "never"` to disable.

## Development

```bash
bun install
bun test
bun run typecheck
```

## Upgrading

```bash
# Update to the latest version
bun install -g prodboard@latest

# If running as a systemd service, reinstall to pick up the new binary path
prodboard install --force
```

## License

MIT
