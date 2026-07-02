import { sourcesRepo } from "@/server/db/repos/sources";
import { compositeEmployeeKey } from "@/shared/lib/compositeEmployeeKey";
import type {
  EmployeePairPost,
  EmployeePairPatch,
} from "@/server/api/schemas/employeePairSchema";
import { employeePairingRepo } from "@/server/db/repos/employeePairing";
import { employeeMappingRepo } from "@/server/db/repos/employeeMapping";
import type { ControllerReturn } from "@/server/api/util/types";

export class EmployeePairController {
  async getEmployeePairs(
    comparisonId: number,
  ): Promise<
    ControllerReturn<
      Awaited<ReturnType<typeof employeePairingRepo.getMatched>>
    >
  > {
    return {
      status: 200,
      data: await employeePairingRepo.getMatched(comparisonId),
    };
  }

  async postEmployeePair(
    comparisonId: number,
    body: EmployeePairPost,
  ): Promise<
    ControllerReturn<Awaited<ReturnType<typeof employeePairingRepo.add>>>
  > {
    try {
      return {
        status: 201,
        data: await employeePairingRepo.add(
          comparisonId,
          body.legacy_key,
          body.new_key,
        ),
      };
    } catch {
      return {
        status: 409,
        error: "Pairing already exists for this legacy or new key",
      };
    }
  }

  async deleteEmployeePair(
    comparisonId: number,
    pairingId: string,
  ): Promise<ControllerReturn<{ ok: true }>> {
    const removed = await employeePairingRepo.remove(
      comparisonId,
      pairingId,
    );
    if (!removed) return { status: 404, error: "Pairing not found" };
    return { status: 200, data: { ok: true } };
  }

  async patchEmployeePair(
    comparisonId: number,
    pairingId: string,
    body: EmployeePairPatch,
  ): Promise<
    ControllerReturn<
      NonNullable<Awaited<ReturnType<typeof employeePairingRepo.update>>>
    >
  > {
    const updates: Partial<{ resolved: boolean; note: string | null }> = {};
    if (body.resolved !== undefined) updates.resolved = body.resolved;
    if (body.note !== undefined) updates.note = body.note;

    const row = await employeePairingRepo.update(
      comparisonId,
      pairingId,
      updates,
    );
    if (!row) return { status: 404, error: "Pairing not found" };
    return { status: 200, data: row };
  }

  async getSourceEmployees(
    comparisonId: number,
    type: "legacy" | "new",
    keyParams: string[],
  ): Promise<
    ControllerReturn<Array<{ key: string; display_name: string | null }>>
  > {
    const source = await sourcesRepo.find(comparisonId, type);
    if (!source) return { status: 404, error: "Source not found" };

    let keyCols = keyParams;
    if (!keyCols.length) {
      const mapping = await employeeMappingRepo.findByComparisonId(
        comparisonId,
      );
      if (!mapping) return { status: 422, error: "No key columns available" };
      keyCols =
        type === "legacy"
          ? mapping.legacy_employee_key
          : mapping.new_employee_key;
      if (!keyCols.length)
        return { status: 422, error: "No key columns available" };
    }

    let firstNameCol: string | null = null;
    let lastNameCol: string | null = null;
    if (type === "new") {
      const mapping = await employeeMappingRepo.findByComparisonId(
        comparisonId,
      );
      firstNameCol = mapping?.new_first_name_column ?? null;
      lastNameCol = mapping?.new_last_name_column ?? null;
    }

    const seen = new Set<string>();
    const result: Array<{ key: string; display_name: string | null }> = [];

    for (const row of source.rows) {
      const key = compositeEmployeeKey(row, keyCols);
      if (seen.has(key)) continue;
      seen.add(key);

      let display_name: string | null = null;
      if (firstNameCol && lastNameCol) {
        const first = row[firstNameCol] ?? "";
        const last = row[lastNameCol] ?? "";
        display_name = `${first} ${last}`.trim() || null;
      }

      result.push({ key, display_name });
    }

    return { status: 200, data: result };
  }
}
