import { Hono } from "hono";
import { Layout } from "../components/layout.tsx";
import type { Database } from "bun:sqlite";
import type { Config } from "../../types.ts";

export function authRoutes(_db: Database, _config: Config) {
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
    if (password === _config.webui.password) {
      const token = Buffer.from(password).toString("base64");
      c.header("Set-Cookie", `prodboard_auth=${token}; Path=/; HttpOnly; SameSite=Strict`);
      return c.redirect("/");
    }
    return c.redirect("/login?error=1");
  });

  return app;
}
