import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/server/db";
import { columnMapping, columnPairing } from "@/server/db/schema";
import type { ColumnMappingEntryInput, StoredColumnMappingEntry } from "@/server/api/util/types";

export type SQLiteWriteStatement = BatchItem<"sqlite"> & { toSQL(): { sql: string; params: unknown[] } };

export class ColumnMappingRepository {

  async findByComparisonId(comparison_id: number): Promise<StoredColumnMappingEntry[] | null> {
    const [entries, pairings] = await db.batch([
      db.select().from(columnMapping)
        .where(eq(columnMapping.comparison_id, comparison_id))
        .orderBy(columnMapping.category, columnMapping.display_order),
      db.select().from(columnPairing)
        .where(eq(columnPairing.comparison_id, comparison_id)),
    ]);

    if (entries.length === 0) return null;

    return entries.map((entry) => ({
      ...entry,
      legacy_columns: pairings
        .filter((p) => p.column_mapping_id === entry.id && p.source_type === "legacy")
        .map((p) => p.column_name),
      new_columns: pairings
        .filter((p) => p.column_mapping_id === entry.id && p.source_type === "new")
        .map((p) => p.column_name),
    }));
  }

  buildWriteStatements(comparison_id: number, entries: ColumnMappingEntryInput[], ids: string[]): SQLiteWriteStatement[] {
    const statements: SQLiteWriteStatement[] = [
      db.delete(columnMapping).where(eq(columnMapping.comparison_id, comparison_id)),
    ];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const id = ids[i];
      statements.push(
        db.insert(columnMapping).values({
          id,
          comparison_id,
          category: entry.category,
          label: entry.label,
          tolerance: entry.tolerance,
          display_order: entry.display_order,
        })
      );

      const pairings = [
        ...entry.legacy_columns.map((col) => ({
          column_mapping_id: id,
          comparison_id,
          source_type: "legacy" as const,
          column_name: col,
        })),
        ...entry.new_columns.map((col) => ({
          column_mapping_id: id,
          comparison_id,
          source_type: "new" as const,
          column_name: col,
        })),
      ];

      if (pairings.length > 0) {
        statements.push(db.insert(columnPairing).values(pairings));
      }
    }

    return statements;
  }

  async upsert(comparison_id: number, entries: ColumnMappingEntryInput[]): Promise<StoredColumnMappingEntry[]> {
    await db.delete(columnMapping).where(eq(columnMapping.comparison_id, comparison_id));

    const results: StoredColumnMappingEntry[] = [];

    for (const entry of entries) {
      const id = crypto.randomUUID();
      const [row] = await db
        .insert(columnMapping)
        .values({
          id,
          comparison_id,
          category: entry.category,
          label: entry.label,
          tolerance: entry.tolerance,
          display_order: entry.display_order,
        })
        .returning();

      const pairingInserts = [
        ...entry.legacy_columns.map((col) => ({
          column_mapping_id: row.id,
          comparison_id,
          source_type: "legacy" as const,
          column_name: col,
        })),
        ...entry.new_columns.map((col) => ({
          column_mapping_id: row.id,
          comparison_id,
          source_type: "new" as const,
          column_name: col,
        })),
      ];

      if (pairingInserts.length > 0) {
        await db.insert(columnPairing).values(pairingInserts);
      }

      results.push({
        ...row,
        legacy_columns: entry.legacy_columns,
        new_columns: entry.new_columns,
      });
    }

    return results;
  }
}


export const columnMappingRepo = new ColumnMappingRepository()