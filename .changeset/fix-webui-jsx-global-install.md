---
"prodboard": patch
---

Fix webui failing to load when prodboard is installed globally by adding `@jsxImportSource hono/jsx` pragma to all TSX files.
