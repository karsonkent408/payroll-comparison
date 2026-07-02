import { and, eq, getTableColumns } from "drizzle-orm";
import { collaborator } from "@/server/db/schema";
import { user } from "@/server/db/schema/auth-schema";
import { db } from '@/server/db'

export class CollaboratorRepository {

  async getAll(comparisonId: number) {
    return db
      .select({ ...getTableColumns(collaborator), userName: user.name, userEmail: user.email, role: user.role })
      .from(collaborator)
      .leftJoin(user, eq(user.id, collaborator.userId))
      .where(eq(collaborator.comparisonId, comparisonId))
      .all();
  }

  async find(comparisonId: number, userId: string) {
    const [row] = await db
      .select()
      .from(collaborator)
      .where(and(eq(collaborator.comparisonId, comparisonId), eq(collaborator.userId, userId)))
      .all();
    return row ?? null;
  }

  async findOwner(comparisonId: number) {
    const [row] = await db
      .select()
      .from(collaborator)
      .where(and(eq(collaborator.comparisonId, comparisonId), eq(collaborator.access, "owner")))
      .all();
    return row ?? null;
  }

  async add(comparisonId: number, userId: string, access: "viewer" | "editor", createdBy: string) {
    const [row] = await db
      .insert(collaborator)
      .values({ comparisonId, userId, access, createdBy })
      .returning();
    return row;
  }

  async updateAccess(comparisonId: number, userId: string, access: "viewer" | "editor") {
    const [row] = await db
      .update(collaborator)
      .set({ access })
      .where(and(eq(collaborator.comparisonId, comparisonId), eq(collaborator.userId, userId)))
      .returning();
    return row;
  }

  async remove(comparisonId: number, userId: string) {
    const row = await this.find(comparisonId, userId);
    if (!row) throw new Error("Collaborator not found");
    if (row.access === "owner") throw new Error("Cannot remove the owner. Assign a new owner first");
    const [deleted] = await db
      .delete(collaborator)
      .where(and(eq(collaborator.comparisonId, comparisonId), eq(collaborator.userId, userId)))
      .returning();
    return deleted;
  }

  async transferOwnership(comparisonId: number, newOwnerId: string) {
    const previousOwner = await this.findOwner(comparisonId);
    if (!previousOwner) throw new Error("No current owner found");
    const newOwnerRow = await this.find(comparisonId, newOwnerId);
    if (!newOwnerRow) throw new Error("New owner must already be a collaborator on this comparison");
    await db.batch([
      db.update(collaborator)
        .set({ access: "editor" })
        .where(and(eq(collaborator.comparisonId, comparisonId), eq(collaborator.userId, previousOwner.userId))),
      db.update(collaborator)
        .set({ access: "owner" })
        .where(and(eq(collaborator.comparisonId, comparisonId), eq(collaborator.userId, newOwnerId))),
    ]);
  }
}

export const collaboratorRepo = new CollaboratorRepository()