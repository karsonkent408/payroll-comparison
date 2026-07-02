import { createHono } from "@/server/api/util/hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { EmployeePairController } from "@/server/api/controllers/employeePairController";
import {
  employeePairPostSchema,
  employeePairPatchSchema,
  employeePairQuerySchema,
} from "@/server/api/schemas/employeePairSchema";
import { checkPermission } from "../middleware";

const paramSchema = z.object({ id: z.coerce.number() });
const pairingParamSchema = z.object({ id: z.coerce.number(), pairingId: z.string() });
const sourceParamSchema = z.object({ id: z.coerce.number(), type: z.enum(["legacy", "new"]) });

const router = createHono()

.get(
  "/:id/employeePair",
  zValidator("param", paramSchema),
  checkPermission('read'),
  async (c) => {
    const { id } = c.req.valid('param');
    const empPairCntrl = new EmployeePairController()
    const result = await empPairCntrl.getEmployeePairs(id);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data);
  }
)

.post(
  "/:id/employeePair",
  zValidator("param", paramSchema),
  zValidator("json", employeePairPostSchema, (result, c) => {
    if (!result.success) return c.json({ errors: result.error.issues }, 400);
  }),
  checkPermission('write'),
  async (c) => {
    const { id } = c.req.valid('param')
    const json = c.req.valid('json')
    const empPairCntrl = new EmployeePairController()
    const result = await empPairCntrl.postEmployeePair(id, json);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data, 201);
  }
)

.delete(
  "/:id/employeePair/:pairingId",
  zValidator("param", pairingParamSchema),
  checkPermission('write'),
  async (c) => {
    const { id, pairingId } = c.req.valid('param');
    const empPairCntrl = new EmployeePairController()
    const result = await empPairCntrl.deleteEmployeePair(id, pairingId);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data);
  }
)

.patch(
  "/:id/employeePair/:pairingId",
  zValidator("param", pairingParamSchema),
  zValidator("json", employeePairPatchSchema, (result, c) => {
    if (!result.success) return c.json({ errors: result.error.issues }, 400);
  }),
  checkPermission('write'),
  async (c) => {
    const { id, pairingId } = c.req.valid('param');
    const json = c.req.valid('json')
    const empPairCntrl = new EmployeePairController()

    const result = await empPairCntrl.patchEmployeePair(id, pairingId, json);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data);
  }
)

.get(
  "/:id/source/:type/employees",
  zValidator("param", sourceParamSchema),
  zValidator("query", employeePairQuerySchema),
  checkPermission('read'),
  async (c) => {
    const keyParams = c.req.queries("key[]") ?? [];
    const { id, type } = c.req.valid("param");
    const empPairCntrl = new EmployeePairController()

    const result = await empPairCntrl.getSourceEmployees(id, type, keyParams);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data);
  }
);

export default router;
