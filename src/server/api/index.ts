import { routePartykitRequest } from "partyserver";
import routes from "@/server/api/routes";
import { createAuthMiddleware } from "@/server/api/middleware/auth";
import {
  auth,
} from "@/server/api/util/auth";
import { createHono } from "@/server/api/util/hono";

export { RoomServer } from "@/server/api/controllers/roomController";

const app = createHono()
  .onError((err, c) => {
    console.error("[API error]", err);
    return c.json({ error: err.message ?? "Internal server error" }, 500);
  })
  .get("/api/auth/me", async (c) => {
    const sessionData = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!sessionData) return c.json({ error: "Unauthorized" }, 401);
    const u = sessionData.user as typeof sessionData.user & { role: string };
    return c.json({ id: u.id, name: u.name, email: u.email, role: u.role });
  })
  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .use("/api/*", async (c, next) => {
    return createAuthMiddleware(auth)(c, next);
  })
  .all("/parties/*", async (c) => {
    const res = await routePartykitRequest(c.req.raw, c.env);
    return res ?? c.notFound();
  })
  .route("/api", routes);

export type AppType = typeof app;
export default app;
