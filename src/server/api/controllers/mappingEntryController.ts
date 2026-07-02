import { mappingEntriesRepo } from "@/server/db/repos/mappingEntries";
import type { MappingEntryPatch } from "@/server/api/schemas/mappingEntrySchema";

export class MappingEntryController {
  async patch(comparisonId: number, mappingEntryId: number, body: MappingEntryPatch) {
    const values: Parameters<typeof mappingEntriesRepo.patch>[2] = {};

    if ("manual_override" in body) values.manual_override = body.manual_override;
    if ("note" in body) values.note = body.note;

    if (body.legacy_value !== undefined) {
      const row = await mappingEntriesRepo.findWithColumn(comparisonId, mappingEntryId);
      if (!row) return { status: 404 as const, error: "MappingEntry not found" };

      const newLegacyValue = Math.abs(body.legacy_value);
      const newDifference = newLegacyValue - Math.abs(row.entry.new_value);

      values.legacy_value = newLegacyValue;
      values.difference = newDifference;
      values.auto_status = newDifference >= -row.tolerance && newDifference <= row.tolerance ? "resolved" : "unresolved";
    }

    const result = await mappingEntriesRepo.patch(comparisonId, mappingEntryId, values);
    if (!result) return { status: 404 as const, error: "MappingEntry not found" };
    return { status: 200 as const, data: result };
  }

  async clearOverrides(comparisonId: number) {
    await mappingEntriesRepo.clearOverrides(comparisonId);
    return { status: 200 as const, data: { ok: true } };
  }
}

