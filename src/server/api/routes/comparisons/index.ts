import { createHono } from "../../util/hono";
import { requireUser, checkPermission, requireAdminOrImplementor } from "../../middleware";
import { comparisonCntrl } from "@/server/api/controllers/comparisonController";
import { broadcastToRoom } from "../../util/party";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import type { CategoryStats } from "../../util/types";
import sourcesRoutes from "@/server/api/routes/sources";
import sourceCellsRoutes from "@/server/api/routes/sourceCells";
import reconfigureRoutes from "@/server/api/routes/reconfigure";
import mappingEntryRoutes from "@/server/api/routes/mappingEntry";
import resultsRoutes from "@/server/api/routes/results";
import aiMapRoutes from "@/server/api/routes/aiMap";
import exportRoutes from "@/server/api/routes/export";
import employeePairRoutes from "@/server/api/routes/employeePair";
import employeeMappingRoutes from "@/server/api/routes/employeeMapping";
import columnMappingRoutes from "@/server/api/routes/columnMapping";
import collaboratorRoutes from "@/server/api/routes/collaborators";

const filterSchema = z.object({
  field: z.enum(["label", "pay_period_start", "pay_period_end", "status", "owner"]),
  operator: z.enum([
    "is", "is not", "contains", "does not contain",
    "is before", "is after", "is between",
    "is one of", "is not one of",
  ]),
  value: z.union([z.string(), z.array(z.string())]),
});

const router = createHono()
  .use("*", requireUser())

  .get(
    "/",
    zValidator("query", z.object({
      filters: z.string()
        .transform((s, ctx) => {
          try { return JSON.parse(s); }
          catch {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid filters JSON" });
            return z.NEVER;
          }
        })
        .pipe(z.array(filterSchema))
        .optional(),
      page: z.coerce.number().min(1).default(1),
      pageSize: z.coerce.number().min(1).default(20),
    })),
    async (c) => {
      const { filters, page, pageSize } = c.req.valid("query");
      const user = c.get("user");
      const result = await comparisonCntrl.listComparisons({
        filters: filters ?? [],
        page,
        pageSize,
        viewerId: user.id,
        viewerRole: user.role ?? undefined,
      });
      if ("error" in result) return c.json({ error: result.error }, result.status);
      return c.json(result.data);
    },
  )

  .post(
    "/",
    zValidator("json", z.object({
      label: z.string(),
      pay_period_start: z.string(),
      pay_period_end: z.string(),
      description: z.string().optional(),
    })),
    requireAdminOrImplementor(),
    async (c) => {
      const body = c.req.valid("json");
      const contextUser = c.get("user");
      const result = await comparisonCntrl.createComparison({
        label: body.label,
        pay_period_start: body.pay_period_start,
        pay_period_end: body.pay_period_end,
        description: body.description,
        created_by: contextUser?.id ?? null,
        owner_id: contextUser!.id,
      });
      if ("error" in result) return c.json({ error: result.error }, result.status);
      return c.json(result.data, 201);
    },
  )

  .get(
    "/:id",
    zValidator("param", z.object({ id: z.coerce.number() })),
    checkPermission("read"),
    async (c) => {
      const { id } = c.req.valid("param");
      const compResult = await comparisonCntrl.getComparison(id);
      if ("error" in compResult) return c.json({ error: compResult.error }, compResult.status);
      const summaryResult = await comparisonCntrl.getSummary(id);
      const byCategory: Record<string, CategoryStats> = "data" in summaryResult ? summaryResult.data.byCategory : {};
      const unmatched = "data" in summaryResult ? summaryResult.data.unmatched : { total: 0, resolved: 0 };
      return c.json({ ...compResult.data, summary: { byCategory, unmatched } });
    },
  )

  .patch(
    "/:id",
    zValidator("param", z.object({ id: z.coerce.number() })),
    zValidator("json", z.object({
      label: z.string(),
      pay_period_start: z.string(),
      pay_period_end: z.string(),
      description: z.string(),
      sort_preference: z.enum(["discrepancy_amount", "first_name", "last_name", "employee_key"]),
    }).partial()),
    checkPermission("write"),
    async (c) => {
      const { id } = c.req.valid("param");
      const json = c.req.valid("json");
      const result = await comparisonCntrl.updateComparison(id, json);
      if ("error" in result) return c.json({ error: result.error }, result.status);
      return c.json(result.data);
    },
  )

  .delete(
    "/:id",
    zValidator("param", z.object({ id: z.coerce.number() })),
    checkPermission("write"),
    async (c) => {
      const { id } = c.req.valid("param");
      const u = c.get("user");
      const result = await comparisonCntrl.deleteComparison(id);
      if ("error" in result) return c.json({ error: result.error }, result.status);
      broadcastToRoom(c.env, String(id), { type: "deleted", updatedBy: u.id }).catch(() => {});
      return new Response(null, { status: 204 });
    },
  )

  .route("/", sourcesRoutes)
  .route("/", sourceCellsRoutes)
  .route("/", resultsRoutes)
  .route("/", mappingEntryRoutes)
  .route("/", reconfigureRoutes)
  .route("/", exportRoutes)
  .route("/", aiMapRoutes)
  .route("/", employeePairRoutes)
  .route("/", employeeMappingRoutes)
  .route("/", columnMappingRoutes)
  .route("/", collaboratorRoutes);

export default router;
