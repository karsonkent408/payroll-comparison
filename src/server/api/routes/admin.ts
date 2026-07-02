import { createHono } from "@/server/api/util/hono";
import { zValidator } from "@hono/zod-validator";
import { z } from 'zod'
import { requireAdmin } from "../middleware";
import { UserController } from "../controllers/userController";

const router = createHono()
.use("*", requireAdmin())

.get("/users",
  zValidator('query', z.object({
    includeSuspended: z.string().optional().transform((v) => v === 'true'),
  })),
  async (c) => {
    const { includeSuspended } = c.req.valid('query');
    const userCntrl = new UserController()
    const result = await userCntrl.listUsers(includeSuspended);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data);
  })

.post(
  '/users',
  zValidator('json', z.object({
    name: z.string(),
    email: z.string(),
    image: z.string().optional(),
    role: z.enum(['admin', 'implementor', 'guest']).default('guest'),
  })),
  async (c) => {
    const body = c.req.valid('json');
    const userCntrl = new UserController()
    const result = await userCntrl.createUser(
      body.email,
      body.role,
      body.name,
      body.image
    );
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data, 201);
  }
)

.patch(
  "/users/:id",
  zValidator('param', z.object({ id: z.string() })),
  zValidator('json', z.object({ role: z.string() })),
  async (c) => {
    const { id } = c.req.valid('param');
    const { role } = c.req.valid('json');
    const userCntrl = new UserController()
    const result = await userCntrl.updateRole(id, role);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data);
  }
)

.post(
  '/users/:id/suspend',
  zValidator('param', z.object({ id: z.string() })),
  zValidator('json', z.object({ suspended: z.boolean(), reason: z.string().optional() })),
  async (c) => {
    const { id } = c.req.valid('param');
    const { suspended, reason } = c.req.valid('json');
    const userCntrl = new UserController()

    const result = await userCntrl.setSuspended(id, suspended, reason);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json(result.data);
  }
)

.delete(
  '/users/:id',
  zValidator('param', z.object({ id: z.string() })),
  async (c) => {
    const { id } = c.req.valid('param');
    const userCntrl = new UserController()

    const result = await userCntrl.deleteUser(id);
    if ('error' in result) return c.json({ error: result.error }, result.status);
    return c.json({ success: true });
  }
)

export default router;
