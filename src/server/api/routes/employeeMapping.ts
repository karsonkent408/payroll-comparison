import { createHono } from "@/server/api/util/hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { EmployeeMappingController } from "@/server/api/controllers/employeeMappingController";
import { employeeMappingBodySchema } from "@/server/api/schemas/employeeMappingSchema";
import { checkPermission } from "../middleware";

const paramSchema = z.object({ id: z.coerce.number() });

const router = createHono()

.get(
  "/:id/employeeMapping",
  zValidator("param", paramSchema),
  checkPermission('read'),
  async (c) => {
    const { id } = c.req.valid('param');
    const empMappingCntrl = new EmployeeMappingController();
    const result = await empMappingCntrl.getEmployeeMapping(id);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data);
  }
)

.post(
  "/:id/employeeMapping",
  zValidator("param", paramSchema),
  zValidator("json", employeeMappingBodySchema, (result, c) => {
    if (!result.success) return c.json({ errors: result.error.issues }, 400);
  }),
  checkPermission('write'),
  async (c) => {
    const { id } = c.req.valid('param');
    const json = c.req.valid('json')
    const empMappingCntrl = new EmployeeMappingController();
    const result = await empMappingCntrl.postEmployeeMapping(id, json);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data);
  }
);

export default router;
