/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { TAILWIND_SCRIPT, THEME, STYLES } from "../static/style.ts";

export const Layout: FC<{ title?: string; children: any }> = ({ title, children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} - prodboard` : "prodboard"}</title>
        {raw(TAILWIND_SCRIPT)}
        {raw(THEME)}
        <style>{STYLES}</style>
      </head>
      <body class="bg-background text-foreground min-h-screen">
        <header class="border-b border-border">
          <div class="mx-auto max-w-7xl flex items-center justify-between px-6 h-14">
            <a href="/" class="text-sm font-bold tracking-tight text-foreground hover:text-foreground/80">
              prodboard
            </a>
            <nav class="flex items-center gap-1">
              <a href="/issues" class="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                Issues
              </a>
              <a href="/schedules" class="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                Schedules
              </a>
              <a href="/runs" class="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                Runs
              </a>
            </nav>
          </div>
        </header>
        <main class="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
};
