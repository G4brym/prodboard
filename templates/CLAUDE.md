# prodboard

This project uses prodboard for issue tracking. The prodboard MCP server is configured and available.

## Supported Agents
prodboard supports multiple AI coding agents (Claude Code, OpenCode). The daemon is configured to use one agent at a time.

## Issue Workflow
- Check `board_summary` at the start of each session
- Use `pick_next_issue` to claim work
- Add comments to track progress
- Call `complete_issue` when done

## Statuses
todo → in-progress → review → done → archived
