import { collaboratorRepo } from "@/server/db/repos/collaborators";
import type { ControllerReturn } from "@/server/api/util/types";
import type { collaborator } from "@/server/db/schema";
import { userRepo } from "@/server/db/repos/users";

type Collaborator = typeof collaborator.$inferSelect;

export class CollaboratorController {
  async getCollaborators(
    comparisonId: number,
  ): Promise<
    ControllerReturn<Awaited<ReturnType<typeof collaboratorRepo.getAll>>>
  > {
    return {
      status: 200,
      data: await collaboratorRepo.getAll(comparisonId),
    };
  }

  async getCollaborator(
    comparisonId: number,
    userId: string,
  ): Promise<ControllerReturn<Collaborator>> {
    const row = await collaboratorRepo.find(comparisonId, userId);
    if (!row) return { status: 404, error: "Collaborator not found" };
    return { status: 200, data: row };
  }

  async addCollaborator(
    comparisonId: number,
    userId: string,
    access: "viewer" | "editor",
    createdBy: string,
  ): Promise<ControllerReturn<Collaborator>> {
    const existing = await collaboratorRepo.find(comparisonId, userId);
    if (existing)
      return {
        status: 409,
        error: "User is already a collaborator on this comparison",
      };
    const row = await collaboratorRepo.add(
      comparisonId,
      userId,
      access,
      createdBy,
    );
    if (!row) return { status: 500, error: "Failed to add collaborator" };
    return { status: 201, data: row };
  }

  async changeCollaboratorAccess(
    comparisonId: number,
    userId: string,
    access: "viewer" | "editor",
  ): Promise<ControllerReturn<Collaborator>> {
    const existing = await collaboratorRepo.find(comparisonId, userId);
    if (!existing) return { status: 404, error: "Collaborator not found" };
    if (existing.access === "owner")
      return {
        status: 403,
        error:
          "Cannot change the owner's access directly. Use the transfer-ownership endpoint.",
      };
    const row = await collaboratorRepo.updateAccess(
      comparisonId,
      userId,
      access,
    );
    if (!row) return { status: 404, error: "Collaborator not found" };
    return { status: 200, data: row };
  }

  async removeCollaborator(
    comparisonId: number,
    userId: string,
  ): Promise<ControllerReturn<Collaborator>> {
    try {
      const row = await collaboratorRepo.remove(comparisonId, userId);
      if (!row) return { status: 404, error: "Collaborator not found" };
      return { status: 200, data: row };
    } catch (e) {
      if (e instanceof Error) return { status: 403, error: e.message };
      throw e;
    }
  }

  async getOwner(
    comparisonId: number,
  ): Promise<ControllerReturn<Collaborator>> {
    const row = await collaboratorRepo.findOwner(comparisonId);
    if (!row) return { status: 404, error: "No owner found" };
    return { status: 200, data: row };
  }

  async changeOwner(
    comparisonId: number,
    userId: string,
  ): Promise<ControllerReturn<{ success: true }>> {
    const userRow = await userRepo.getById(userId);
    if (!userRow) return { status: 404, error: "User not found" };
    if (userRow.role === "guest")
      return { status: 403, error: "Cannot assign a guest as the owner" };

    try {
      await collaboratorRepo.transferOwnership(comparisonId, userId);
      return { status: 200, data: { success: true } };
    } catch (e) {
      if (e instanceof Error) return { status: 403, error: e.message };
      throw e;
    }
  }
}

