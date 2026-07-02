import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/server/api/util/hono";
import type { Auth } from "@/server/api/util/auth";

export function createAuthMiddleware(auth: Auth): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.path.startsWith("/api/auth/")) return next();

    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    c.set("user" as never, session.user);
    return next();
  };
}

export function requireUser(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "Unauthorized" }, 401);
    return next();
  };
}

export function requireAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "Unauthorized" }, 401);
    if (u.role !== "admin") return c.json({ error: "Forbidden" }, 403);
    return next();
  };
}

export function requireAdminOrImplementor(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "Unauthorized" }, 401);
    if (u.role !== "admin" && u.role !== "implementor") return c.json({ error: "Forbidden" }, 403);
    return next();
  };
}
