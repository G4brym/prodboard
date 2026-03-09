---
"prodboard": patch
---

Fix schedules with identical cron patterns — all matching schedules now fire

Snapshot the running-run count once before the tick loop instead of re-querying
inside the loop. This prevents a run created for schedule A from counting against
schedule B's concurrency check when both share the same cron expression.
