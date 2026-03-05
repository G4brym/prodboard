import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { csrf } from "hono/csrf";
import crypto from "crypto";
import type { Database } from "bun:sqlite";
import type { Config } from "../types.ts";
import { issueRoutes } from "./routes/issues.tsx";
import { scheduleRoutes } from "./routes/schedules.tsx";
import { runRoutes, apiRoutes } from "./routes/runs.tsx";
import { authRoutes } from "./routes/auth.tsx";

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function generateAuthToken(password: string, salt: string): string {
  return crypto.createHmac("sha256", salt).update(password).digest("hex");
}

export function createApp(db: Database, config: Config, authSalt?: string): Hono {
  const app = new Hono();
  const salt = authSalt ?? crypto.randomBytes(32).toString("hex");

  // Security headers
  app.use("*", secureHeaders());

  // CSRF protection
  app.use("*", csrf());

  // Error handler
  app.onError((err, c) => {
    if (err.message?.includes("not found") || err.message?.includes("No issue") || err.message?.includes("No schedule")) {
      return c.text("Not found", 404);
    }
    if (err.message?.includes("Invalid status") || err.message?.includes("Invalid cron")) {
      return c.text(err.message, 400);
    }
    console.error("[prodboard] Web UI error:", err.message);
    return c.text("Internal server error", 500);
  });

  // Auth middleware
  if (config.webui.password !== null) {
    const expectedToken = generateAuthToken(config.webui.password, salt);

    app.use("*", async (c, next) => {
      const path = c.req.path;
      if (path === "/login" || path === "/logout") {
        return next();
      }
      const cookie = getCookie(c, "prodboard_auth");
      if (!cookie || !timingSafeCompare(cookie, expectedToken)) {
        return c.redirect("/login");
      }
      return next();
    });
  }

  // Mount routes
  app.route("/", authRoutes(db, config, salt));
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
