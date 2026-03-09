---
"prodboard": minor
---

Add `trigger_schedule` MCP tool to manually trigger a schedule run

Adds a new MCP tool that allows agents and users to trigger a schedule to run immediately without waiting for the cron interval. The run is started asynchronously and returns the run ID so callers can check status via `list_runs`. Disabled schedules are rejected, and the concurrent run limit is enforced.
