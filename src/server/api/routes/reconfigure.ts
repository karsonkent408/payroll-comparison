import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createHono } from "@/server/api/util/hono";
import { reconfigureCntrl } from "@/server/api/controllers/reconfigureController";
import { reconfigureMappingSchema } from "@/server/api/schemas/reconfigureSchema";
import { checkPermission } from "@/server/api/middleware";
import { broadcastToRoom } from "../util/party";

const paramSchema = z.object({ id: z.coerce.number().int().positive() });

const formSchema = z.object({
  mapping: z.string().transform((str, ctx) => {
    let raw: unknown;
    try {
      raw = JSON.parse(str);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "mapping must be valid JSON" });
      return z.NEVER;
    }
    const result = reconfigureMappingSchema.safeParse(raw);
    if (!result.success) {
      ctx.addIssue({ code: "custom", message: result.error.message });
      return z.NEVER;
    }
    return result.data;
  }),
  reset_statuses: z.string().optional().transform((v) => v === "true"),
  reset_notes: z.string().optional().transform((v) => v === "true"),
  legacy_file: z.unknown().optional(),
  new_file: z.unknown().optional(),
});

const router = createHono()

.post(
  "/:id/reconfigure",
  zValidator("param", paramSchema),
  checkPermission('write'),
  zValidator("form", formSchema),
  async (c) => {
    const { id: comparisonId } = c.req.valid("param");
    const u = c.get("user");
    const { mapping, reset_statuses: resetStatuses, reset_notes: resetNotes, legacy_file, new_file } = c.req.valid("form");

    const result = await reconfigureCntrl.execute({
      comparisonId,
      user: u,
      mapping,
      resetStatuses,
      resetNotes,
      legacyFile: legacy_file instanceof File ? legacy_file : null,
      newFile: new_file instanceof File ? new_file : null,
    });

    if (result.status === 200) {
      broadcastToRoom(c.env, String(comparisonId), { type: "reconfigure", updatedBy: { id: u.id, name: u.name } }).catch(() => {});
      return c.json(result.data);
    }
    if (result.status === 422) return c.json({ error: result.error }, 422);
    return c.json({ error: result.error }, 500);
  }
);

export default router;
