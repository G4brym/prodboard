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
        <div class="login-box">
          <h1>Login</h1>
          {error && <div class="flash">Invalid password</div>}
          <form method="post" action="/login">
            <div class="form-row">
              <label for="password">Password</label>
              <input type="password" name="password" id="password" required autofocus />
            </div>
            <button type="submit" class="btn btn-primary">Login</button>
          </form>
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
