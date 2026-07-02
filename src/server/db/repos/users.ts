import { and, eq, or, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema/auth-schema";

export class UserRepo {

  async getAll(includeSuspended: boolean = false, role?: string) {
    const suspendedCondition = includeSuspended ? undefined : or(eq(user.banned, false), isNull(user.banned));
    const roleCondition = role ? eq(user.role, role) : undefined;
    const users = await db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned, banReason: user.banReason })
      .from(user)
      .where(and(suspendedCondition, roleCondition))
      .all();
    return users ?? [];
  }

  async getById(userId: string) {
    const [row] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .all();
    return row ?? null;
  }

  async getByEmail(email: string) {
    const [row] = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .all();
    return row ?? null;
  }

  async updateUser(userId: string, role: string) {
    const [updatedUser] = await db
      .update(user)
      .set({ role })
      .where(eq(user.id, userId))
      .returning();
    return updatedUser ?? null;
  }

  async suspendUser(userId: string, reason?: string) {
    const [row] = await db
      .update(user)
      .set({ banned: true, banReason: reason })
      .where(eq(user.id, userId))
      .returning();
    return row;
  }

  async unsuspendUser(userId: string) {
    const [row] = await db
      .update(user)
      .set({ banned: false, banReason: null })
      .where(eq(user.id, userId))
      .returning();
    return row;
  }

  async deleteUser(userId: string) {
    const [row] = await db
      .delete(user)
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    return row;
  }
}

export const userRepo = new UserRepo()