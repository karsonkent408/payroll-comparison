import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ColumnMappingController } from "@/server/api/controllers/columnMappingController";
import { columnMappingBodySchema } from "@/server/api/schemas/columnMappingSchema";
import { createHono } from "@/server/api/util/hono";
import { checkPermission } from "../middleware";

const paramSchema = z.object({ id: z.coerce.number() });
const router = createHono()
  .get(
    "/:id/columnMapping",
    zValidator("param", paramSchema),
    checkPermission("read"),
    async (c) => {
      const { id } = c.req.valid("param");
      const colMappingCntrl = new ColumnMappingController();
      const result = await colMappingCntrl.getColumnMapping(id);
      if ("error" in result)
        return c.json({ error: result.error }, result.status);
      return c.json(result.data);
    },
  )

  .post(
    "/:id/columnMapping",
    zValidator("param", paramSchema),
    zValidator("json", columnMappingBodySchema, (result, c) => {
      if (!result.success) return c.json({ errors: result.error.issues }, 400);
    }),
    checkPermission("write"),
    async (c) => {
      const { id } = c.req.valid("param");
      const json = c.req.valid('json')
      const colMappingCntrl = new ColumnMappingController();

      const result = await colMappingCntrl.postColumnMapping(
        id,
        json,
      );
      if ("error" in result)
        return c.json({ error: result.error }, result.status);
      return c.json(result.data);
    },
  );

export default router;
