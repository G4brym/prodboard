---
"prodboard": patch
---

Fix systemd service missing PATH environment variable

The generated systemd service file only set `HOME` but not `PATH`, causing the daemon to run with a minimal default PATH. This meant tools like `claude` and `gh` installed in user-local directories (e.g. `~/.local/bin`) were not found, resulting in scheduled runs failing with exit code 127.

The fix captures the current `PATH` at install time and includes it in the systemd service file.
