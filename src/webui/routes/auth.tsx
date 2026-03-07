/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import crypto from "crypto";
import { Layout } from "../components/layout.tsx";
import type { Database } from "bun:sqlite";
import type { Config } from "../../types.ts";

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function generateAuthToken(password: string, salt: string): string {
  return crypto.createHmac("sha256", salt).update(password).digest("hex");
}

export function authRoutes(_db: Database, _config: Config, authSalt: string) {
  const app = new Hono();

  app.get("/login", (c) => {
    const error = c.req.query("error");
    return c.html(
      <Layout title="Login">
        <div class="flex items-center justify-center min-h-[calc(100vh-10rem)]">
          <div class="w-full max-w-sm">
            <div class="rounded-lg border border-border bg-card p-6">
              <div class="mb-6">
                <h1 class="text-lg font-semibold text-card-foreground">Login</h1>
                <p class="text-sm text-muted-foreground mt-1">Enter your password to access prodboard.</p>
              </div>
              {error && (
                <div class="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  Invalid password
                </div>
              )}
              <form method="post" action="/login">
                <div class="mb-4">
                  <label for="password" class="block text-sm font-medium text-foreground mb-1.5">Password</label>
                  <input
                    type="password"
                    name="password"
                    id="password"
                    required
                    autofocus
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                  />
                </div>
                <button
                  type="submit"
                  class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Sign in
                </button>
              </form>
            </div>
          </div>
        </div>
      </Layout>
    );
  });

  app.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const password = body.password as string;
    if (timingSafeCompare(password, _config.webui.password!)) {
      const token = generateAuthToken(password, authSalt);
      c.header("Set-Cookie", `prodboard_auth=${token}; Path=/; HttpOnly; SameSite=Strict`);
      return c.redirect("/");
    }
    return c.redirect("/login?error=1");
  });

  app.post("/logout", (c) => {
    c.header("Set-Cookie", `prodboard_auth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return c.redirect("/login");
  });

  return app;
}
