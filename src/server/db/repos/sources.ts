import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { sources } from "@/server/db/schema";
import type { Source, SourceSummary } from "@/lib/types";
import type { SQLiteWriteStatement } from "@/server/db/repos/columnMapping";

export type { Source, SourceSummary } from "@/lib/types";

type SourceRow = typeof sources.$inferSelect;

function deserialize(row: SourceRow): Source {
  return {
    id: row.id,
    comparison_id: row.comparison_id,
    type: row.type,
    file_name: row.file_name,
    uploaded_at: row.uploaded_at,
    row_count: row.row_count,
    headers: JSON.parse(row.headers),
    rows: JSON.parse(row.rows),
    detectedTypes: JSON.parse(row.detected_types),
    columnSections: JSON.parse(row.column_sections),
    legacy_provider: row.legacy_provider ?? null,
    format_notes: row.format_notes ?? null,
  };
}

type UpsertSourceInput = {
  comparison_id: number;
  type: "legacy" | "new";
  file_name: string;
  headers: string[];
  rows: Record<string, string>[];
  detectedTypes: Record<string, "number" | "string" | "date">;
  columnSections?: Record<string, string>;
  legacy_provider?: string;
  format_notes?: string;
};

export class SourceRepository {

  async find(comparison_id: number, type: "legacy" | "new"): Promise<Source | null> {
    const [row] = await db
      .select()
      .from(sources)
      .where(and(eq(sources.comparison_id, comparison_id), eq(sources.type, type)))
      .all();
    return row ? deserialize(row) : null;
  }

  buildUpsertStatement(data: UpsertSourceInput): SQLiteWriteStatement {
    const values = {
      comparison_id: data.comparison_id,
      type: data.type,
      file_name: data.file_name,
      headers: JSON.stringify(data.headers),
      rows: JSON.stringify(data.rows),
      row_count: data.rows.length,
      detected_types: JSON.stringify(data.detectedTypes),
      column_sections: JSON.stringify(data.columnSections ?? {}),
    };

    return db
      .insert(sources)
      .values(values)
      .onConflictDoUpdate({
        target: [sources.comparison_id, sources.type],
        set: {
          file_name: values.file_name,
          headers: values.headers,
          rows: values.rows,
          row_count: values.row_count,
          detected_types: values.detected_types,
          column_sections: values.column_sections,
        },
      });
  }

  async upsert(data: UpsertSourceInput): Promise<SourceSummary> {
    const values = {
      comparison_id: data.comparison_id,
      type: data.type,
      file_name: data.file_name,
      headers: JSON.stringify(data.headers),
      rows: JSON.stringify(data.rows),
      row_count: data.rows.length,
      detected_types: JSON.stringify(data.detectedTypes),
      column_sections: JSON.stringify(data.columnSections ?? {}),
      legacy_provider: data.legacy_provider ?? null,
      format_notes: data.format_notes ?? null,
    };

    const [row] = await db
      .insert(sources)
      .values(values)
      .onConflictDoUpdate({
        target: [sources.comparison_id, sources.type],
        set: {
          file_name: values.file_name,
          headers: values.headers,
          rows: values.rows,
          row_count: values.row_count,
          detected_types: values.detected_types,
          column_sections: values.column_sections,
          legacy_provider: values.legacy_provider,
          format_notes: values.format_notes,
        },
      })
      .returning();

    const { rows: _rows, ...rest } = deserialize(row);
    return rest;
  }

  async patchRows(comparison_id: number, rows: Record<string, string>[]): Promise<void> {
    await db
      .update(sources)
      .set({ rows: JSON.stringify(rows), row_count: rows.length })
      .where(and(eq(sources.comparison_id, comparison_id), eq(sources.type, "legacy")));
  }
}

export const sourcesRepo = new SourceRepository()