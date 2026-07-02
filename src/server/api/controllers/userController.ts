import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import type { ControllerReturn } from "@/server/api/util/types";
import { userRepo } from "@/server/db/repos/users";
import { auth } from "../util/auth";
import { eq, and, or, isNull } from "drizzle-orm";

type UserRow = typeof user.$inferSelect;
type ListUserRow = Pick<UserRow, "id" | "name" | "email" | "role" | "banned" | "banReason" >
type UpdatedUser = Pick<UserRow, "id" | "name" | "email" | "role">;

export class UserController {
  async getUser(userId: string): Promise<ControllerReturn<UserRow>> {
    const row = await userRepo.getById(userId);
    if (!row) return { status: 404, error: "Not found" };
    return { status: 200, data: row };
  }

  async getUserByEmail(email: string): Promise<ControllerReturn<UserRow>> {
    const row = await userRepo.getByEmail(email);
    if (!row) return { status: 404, error: "Not found" };
    return { status: 200, data: row };
  }

  

  async listUsers(
    includeSuspended: boolean,
  ): Promise<ControllerReturn<ListUserRow[]>> {
    const data = await userRepo.getAll(includeSuspended);
    return { status: 200, data };
  }

  async createUser(
    email: string,
    role?: "admin" | "implementor" | "guest",
    name?: string,
    image?: string,
  ): Promise<
    ControllerReturn<
      NonNullable<Awaited<ReturnType<typeof auth.api.createUser>>>
    >
  > {
    const newUser = await auth.api.createUser({
      body: {
        email,
        name: name ?? email.split("@")[0],
        role: role ?? "guest",
      },
    });
    if (!newUser) return { status: 500, error: "Could not create user" };
    return { status: 201, data: newUser };
  }

  async updateRole(
    userId: string,
    role: string,
  ): Promise<ControllerReturn<UpdatedUser>> {
    const [targetRows, adminRows] = await db.batch([
      db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, userId)),
      db.select({ id: user.id }).from(user).where(
        and(eq(user.role, "admin"), or(eq(user.banned, false), isNull(user.banned)))
      ),
    ]);

    if (!targetRows[0]) return { status: 404, error: "Not found" };
    if (targetRows[0].role === "admin" && role !== "admin" && adminRows.length <= 1)
      return { status: 403, error: "Must have at least 1 admin at all times" };

    const updated = await userRepo.updateUser(userId, role);
    return { status: 200, data: updated };
  }

  async setSuspended(
    userId: string,
    suspended: boolean,
    reason?: string,
  ): Promise<ControllerReturn<typeof user.$inferSelect>> {
    const [targetRows, adminRows] = await db.batch([
      db.select().from(user).where(eq(user.id, userId)),
      db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.role, "admin"),
            or(eq(user.banned, false), isNull(user.banned)),
          ),
        ),
    ]);

    if (!targetRows[0]) return { status: 404, error: "Not found" };
    if (suspended && targetRows[0].role === "admin" && adminRows.length <= 1) {
      return { status: 403, error: "Cannot suspend the only active admin" };
    }

    const updated = suspended
      ? await userRepo.suspendUser(userId, reason)
      : await userRepo.unsuspendUser(userId);

    return { status: 200, data: updated };
  }

  async deleteUser(
    userId: string,
  ): Promise<ControllerReturn<{ id: string }>> {
    const [targetRows, adminRows] = await db.batch([
      db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.id, userId)),
      db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.role, "admin"),
            or(eq(user.banned, false), isNull(user.banned)),
          ),
        ),
    ]);

    if (!targetRows[0]) return { status: 404, error: "Not found" };
    if (targetRows[0].role === "admin" && adminRows.length <= 1) {
      return { status: 403, error: "Cannot delete the only admin" };
    }

    const [deleted] = await db
      .delete(user)
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    return { status: 200, data: deleted };
  }
}
