import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { comparisons } from "./comparisons";

export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comparison_id: integer("comparison_id")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["legacy", "new"] }).notNull(),
    file_name: text("file_name").notNull(),
    uploaded_at: text("uploaded_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    headers: text("headers").notNull(),
    rows: text("rows").notNull(),
    row_count: integer("row_count").notNull(),
    detected_types: text("detected_types").notNull().default("{}"),
    column_sections: text("column_sections").notNull().default("{}"),
    legacy_provider: text("legacy_provider"),
    format_notes: text("format_notes"),
  },
  (t) => [
    uniqueIndex("sources_comparison_type_unique").on(t.comparison_id, t.type),
  ],
);
