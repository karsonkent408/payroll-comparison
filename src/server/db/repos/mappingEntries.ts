import { and, eq, sql } from "drizzle-orm";
import { db }  from "@/server/db";
import { mappingEntries, columnMapping, columnPairing } from "@/server/db/schema";
import type { StoredEntryResult } from "@/features/comparisons/types";

type PatchValues = {
  manual_override?: "resolved" | "unresolved" | null;
  note?: string | null;
  legacy_value?: number;
  difference?: number;
  auto_status?: "resolved" | "unresolved";
};

export class MappingEntriesRepository {
  async find(comparisonId: number, mappingEntryId: number) {
    return (
      await db
        .select()
        .from(mappingEntries)
        .where(and(eq(mappingEntries.id, mappingEntryId), eq(mappingEntries.comparison_id, comparisonId)))
        .get()
    ) ?? null;
  }

  async findWithColumn(comparisonId: number, mappingEntryId: number) {
    return (
      await db
        .select({
          entry: mappingEntries,
          tolerance: columnMapping.tolerance,
        })
        .from(mappingEntries)
        .innerJoin(columnMapping, eq(columnMapping.id, mappingEntries.column_mapping_id))
        .where(and(eq(mappingEntries.id, mappingEntryId), eq(mappingEntries.comparison_id, comparisonId)))
        .get()
    ) ?? null;
  }

  async patch(comparisonId: number, mappingEntryId: number, values: PatchValues): Promise<StoredEntryResult | null> {
    const existing = await this.find(comparisonId, mappingEntryId);
    if (!existing) return null;

    const col = await db.select().from(columnMapping).where(eq(columnMapping.id, existing.column_mapping_id)).get();
    if (!col) return null;

    const [row] = await db
      .update(mappingEntries)
      .set({
        manual_override: "manual_override" in values ? (values.manual_override ?? null) : existing.manual_override,
        note: "note" in values ? (values.note ?? null) : existing.note,
        legacy_value: values.legacy_value ?? existing.legacy_value,
        difference: values.difference ?? existing.difference,
        auto_status: values.auto_status ?? existing.auto_status,
        updated_at: sql`(datetime('now'))`,
      })
      .where(eq(mappingEntries.id, mappingEntryId))
      .returning();

    const pairings = await db
      .select()
      .from(columnPairing)
      .where(eq(columnPairing.column_mapping_id, existing.column_mapping_id))
      .all();

    const legacyCols = pairings.filter((p) => p.source_type === "legacy").map((p) => p.column_name);
    const newCols = pairings.filter((p) => p.source_type === "new").map((p) => p.column_name);
    return {
      id: row.id,
      column_entry_id: row.column_mapping_id,
      legacy_columns: legacyCols,
      new_columns: newCols,
      category: col.category,
      label: col.label,
      display_order: col.display_order,
      legacy_value: row.legacy_value,
      legacy_breakdown: legacyCols.length > 1 && row.legacy_breakdown ? JSON.parse(row.legacy_breakdown) : null,
      new_value: row.new_value,
      new_breakdown: newCols.length > 1 && row.new_breakdown ? JSON.parse(row.new_breakdown) : null,
      difference: row.difference,
      tolerance: col.tolerance,
      auto_status: row.auto_status,
      manual_override: row.manual_override,
      note: row.note,
    };
  }

  async clearOverrides(comparisonId: number): Promise<void> {
    await db
      .update(mappingEntries)
      .set({ manual_override: null, note: null, updated_at: sql`(datetime('now'))` })
      .where(eq(mappingEntries.comparison_id, comparisonId));
  }
}

export const mappingEntriesRepo = new MappingEntriesRepository()