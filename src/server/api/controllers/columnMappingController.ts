import type { ColumnMappingBody } from "@/server/api/schemas/columnMappingSchema";
import { columnMappingRepo } from "@/server/db/repos/columnMapping";
import type { ControllerReturn } from "@/server/api/util/types";
import type { StoredColumnMappingEntry } from "@/server/api/util/types";

type ColumnMappingData = { entries: StoredColumnMappingEntry[] };

export class ColumnMappingController {
  async getColumnMapping(
    comparisonId: number,
  ): Promise<ControllerReturn<ColumnMappingData>> {
    const entries = await columnMappingRepo.findByComparisonId(
      comparisonId,
    );
    if (!entries) return { status: 404, error: "No column mapping found" };
    return { status: 200, data: { entries } };
  }

  async postColumnMapping(
    comparisonId: number,
    body: ColumnMappingBody,
  ): Promise<ControllerReturn<ColumnMappingData>> {
    const newSeen = new Map<string, number>();
    const legacySeen = new Map<string, number>();
    for (let i = 0; i < body.entries.length; i++) {
      for (const col of body.entries[i].new_columns) {
        if (newSeen.has(col))
          return {
            status: 409,
            error: `Duplicate New column "${col}" appears in entries ${newSeen.get(col)! + 1} and ${i + 1}`,
          };
        newSeen.set(col, i);
      }
      for (const col of body.entries[i].legacy_columns) {
        if (legacySeen.has(col))
          return {
            status: 409,
            error: `Duplicate Legacy column "${col}" appears in entries ${legacySeen.get(col)! + 1} and ${i + 1}`,
          };
        legacySeen.set(col, i);
      }
    }

    const entries = await columnMappingRepo.upsert(
      comparisonId,
      body.entries,
    );
    return { status: 200, data: { entries } };
  }
}
