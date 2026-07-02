import { createHono } from "@/server/api/util/hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { MappingEntryController } from "@/server/api/controllers/mappingEntryController";
import { mappingEntryParamSchema, mappingEntryPatchSchema } from "@/server/api/schemas/mappingEntrySchema";
import { broadcastToRoom } from "../util/party";
import { checkPermission } from "../middleware";

const clearParamSchema = z.object({ id: z.coerce.number().int() });

const router = createHono()

.patch(
  "/:id/mappingEntry/:mappingEntryId",
  zValidator("param", mappingEntryParamSchema),
  zValidator("json", mappingEntryPatchSchema, (result, c) => {
    if (!result.success) return c.json({ errors: result.error.issues }, 400);
  }),
  checkPermission('write'),
  async (c) => {
    const { id, mappingEntryId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await new MappingEntryController().patch(id, mappingEntryId, body);
    if (result.status !== 200) return c.json({ error: result.error }, result.status);
    const updatedBy = c.get('user').id
    const roomId = String(id)
    const entryId = String(mappingEntryId)
    for (const [field, value] of Object.entries(body) as [string, unknown][]) {
      broadcastToRoom(c.env, roomId, { type: 'edit', entryId, field, value, updatedBy })
    }
    if ('legacy_value' in body) {
      broadcastToRoom(c.env, roomId, { type: 'edit', entryId, field: 'difference', value: result.data.difference, updatedBy })
      broadcastToRoom(c.env, roomId, { type: 'edit', entryId, field: 'auto_status', value: result.data.auto_status, updatedBy })
    }
   return c.json(result.data);
  }
)

.post(
  "/:id/mappingEntry/clear-overrides",
  zValidator("param", clearParamSchema),
  checkPermission('write'),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await new MappingEntryController().clearOverrides(id);
    return c.json(result.data);
  }
)

export default router;
