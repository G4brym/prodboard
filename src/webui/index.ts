import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Database } from "bun:sqlite";
import type { Config } from "../types.ts";
import { issueRoutes } from "./routes/issues.tsx";
import { scheduleRoutes } from "./routes/schedules.tsx";
import { runRoutes, apiRoutes } from "./routes/runs.tsx";
import { authRoutes } from "./routes/auth.tsx";

export function createApp(db: Database, config: Config): Hono {
  const app = new Hono();

  // Auth middleware
  if (config.webui.password) {
    const expectedToken = Buffer.from(config.webui.password).toString("base64");

    app.use("*", async (c, next) => {
      const path = c.req.path;
      if (path === "/login" || path.startsWith("/api/")) {
        return next();
      }
      const cookie = getCookie(c, "prodboard_auth");
      if (cookie !== expectedToken) {
        return c.redirect("/login");
      }
      return next();
    });
  }

  // Mount routes
  app.route("/", authRoutes(db, config));
  app.route("/issues", issueRoutes(db, config));
  app.route("/schedules", scheduleRoutes(db, config));
  app.route("/runs", runRoutes(db, config));
  app.route("/api", apiRoutes(db, config));

  // Root redirect
  app.get("/", (c) => c.redirect("/issues"));

  return app;
}

export async function startWebUI(db: Database, config: Config): Promise<any> {
  const app = createApp(db, config);
  const server = Bun.serve({
    fetch: app.fetch,
    port: config.webui.port,
    hostname: config.webui.hostname,
  });
  console.error(`[prodboard] Web UI started at http://${config.webui.hostname}:${config.webui.port}`);
  return server;
}
