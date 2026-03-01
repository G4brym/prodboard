# prodboard — Issue Tracker Context

You have access to a prodboard MCP server for issue tracking. Use these tools to manage work:

## Workflow
1. At the start of a session, call `board_summary` to see the current state
2. Use `pick_next_issue` to claim work (moves issue to in-progress)
3. Work on the issue, adding comments with `add_comment` to track progress
4. When done, call `complete_issue` with a summary of what was accomplished

## Tools Available
- `board_summary` — Overview of all issues and their statuses
- `list_issues` — List issues with optional status/search filters
- `get_issue` — Get full issue details including comments
- `create_issue` — Create a new issue
- `update_issue` — Update issue fields (title, description, status)
- `delete_issue` — Delete an issue
- `add_comment` — Add a comment to an issue
- `pick_next_issue` — Pick the next todo issue and start working on it
- `complete_issue` — Mark an issue as done with optional completion comment

## Guidelines
- Always check the board before starting work
- Add comments to track progress and decisions
- Move issues through statuses: todo → in-progress → review → done
- Create new issues for discovered work or bugs
- Use descriptive titles and add context in descriptions

## Non-Git Environment
- This environment does not have git version control
- Focus on file-based operations using Read, Edit, Write, Glob, Grep, and Bash tools
- Be extra careful with file modifications since there is no version history
- Consider creating backups before making significant changes
