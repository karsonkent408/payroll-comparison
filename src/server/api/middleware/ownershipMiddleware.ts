import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/server/api/util/hono";
import { canModify, canView, isOwner } from "@/shared/lib/canModify";
import { comparisonCntrl } from "../controllers/comparisonController";
import { collaboratorRepo } from "@/server/db/repos/collaborators";

export function checkPermission(permission: "read" | "write" | "owner"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const comparisonId = Number(c.req.param("id"));
    const u = c.get("user");

    if (!u) return c.json({ error: "Unauthorized" }, 401);

    const compResult = await comparisonCntrl.getComparison(comparisonId);
    if ('error' in compResult) return c.json({ error: compResult.error }, compResult.status);

    const collaborators = await collaboratorRepo.getAll(comparisonId);
    const allowed =
      permission === "owner"
        ? isOwner(u.role, u.id, collaborators)
        : permission === "write"
        ? canModify(u.role, u.id, collaborators)
        : canView(u.role, u.id, collaborators);

    if (!allowed) return c.json({ error: "Forbidden" }, 403);

    return next();
  };
}
