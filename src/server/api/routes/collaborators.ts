import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createHono } from "@/server/api/util/hono";
import { CollaboratorController } from "../controllers/CollaboratorController";
import { UserController } from "../controllers/userController";
import { checkPermission } from "../middleware";

const router = createHono()
  .get(
    "/:id/collaborators",
    zValidator("param", z.object({ id: z.coerce.number() })),
    checkPermission("read"),
    async (c) => {
      const { id: comparisonId } = c.req.valid("param");
      const collabCntrl = new CollaboratorController();
      const result = await collabCntrl.getCollaborators(comparisonId);
      if ("error" in result)
        return c.json({ error: result.error }, result.status);
      return c.json(result.data);
    },
  )

  .post(
    "/:id/collaborators",
    zValidator("param", z.object({ id: z.coerce.number() })),
    zValidator(
      "json",
      z.object({
        userId: z.string(),
        access: z.enum(["viewer", "editor"]),
      }),
    ),
    checkPermission("owner"),
    async (c) => {
      const { id: comparisonId } = c.req.valid("param");
      const { userId, access } = c.req.valid("json");
      const createdBy = c.get("user").id;
      const collabCntrl = new CollaboratorController();
      const result = await collabCntrl.addCollaborator(
        comparisonId,
        userId,
        access,
        createdBy,
      );
      if ("error" in result)
        return c.json({ error: result.error }, result.status);
      return c.json(result.data, 201);
    },
  )

  .patch(
    "/:id/collaborators",
    zValidator("param", z.object({ id: z.coerce.number() })),
    zValidator(
      "json",
      z.object({
        userId: z.string(),
        access: z.enum(["viewer", "editor"]),
      }),
    ),
    checkPermission("owner"),
    async (c) => {
      const { id: comparisonId } = c.req.valid("param");
      const { userId, access } = c.req.valid("json");
      const collabCntrl = new CollaboratorController();
      const result = await collabCntrl.changeCollaboratorAccess(
        comparisonId,
        userId,
        access,
      );
      if ("error" in result)
        return c.json({ error: result.error }, result.status);
      return c.json(result.data);
    },
  )

  .patch(
    "/:id/collaborators/owner",
    zValidator("param", z.object({ id: z.coerce.number() })),
    zValidator("json", z.object({ userId: z.string() })),
    checkPermission("owner"),
    async (c) => {
      const { id: comparisonId } = c.req.valid("param");
      const { userId } = c.req.valid("json");
      const collabCntrl = new CollaboratorController();
      const result = await collabCntrl.changeOwner(comparisonId, userId);
      if ("error" in result)
        return c.json({ error: result.error }, result.status);
      return c.json(result.data);
    },
  )

  .post(
    "/:id/collaborators/invite",
    zValidator("param", z.object({ id: z.coerce.number() })),
    zValidator("json", z.object({ email: z.string().email() })),
    checkPermission("owner"),
    async (c) => {
      const { id: comparisonId } = c.req.valid("param");
      const { email } = c.req.valid("json");
      const createdBy = c.get("user").id;
      const userCntrl = new UserController();
      const collabCntrl = new CollaboratorController();

      let userId: string;
      const existing = await userCntrl.getUserByEmail(email);
      if ("data" in existing) {
        userId = existing.data.id;
      } else {
        const created = await userCntrl.createUser(email);
        if ("error" in created)
          return c.json({ error: created.error }, created.status);
        userId = created.data.user.id;
      }

      const result = await collabCntrl.addCollaborator(
        comparisonId,
        userId,
        "viewer",
        createdBy,
      );
      if ("error" in result)
        return c.json({ error: result.error }, result.status);
      return c.json(result.data, 201);
    },
  )

  .delete(
    "/:id/collaborators/:userId",
    zValidator(
      "param",
      z.object({ id: z.coerce.number(), userId: z.string() }),
    ),
    checkPermission("owner"),
    async (c) => {
      const { id: comparisonId, userId } = c.req.valid("param");
      const collabCntrl = new CollaboratorController();

      const result = await collabCntrl.removeCollaborator(comparisonId, userId);
      if ("error" in result)
        return c.json({ error: result.error }, result.status);
      return c.json(result.data);
    },
  );

export default router;
