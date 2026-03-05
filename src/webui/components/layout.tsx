import type { FC } from "hono/jsx";
import { STYLES } from "../static/style.ts";

export const Layout: FC<{ title?: string; children: any }> = ({ title, children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} - prodboard` : "prodboard"}</title>
        <style>{STYLES}</style>
      </head>
      <body>
        <nav>
          <div class="nav-inner">
            <a href="/" class="logo">prodboard</a>
            <div class="nav-links">
              <a href="/issues">Issues</a>
              <a href="/schedules">Schedules</a>
              <a href="/runs">Runs</a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
};
