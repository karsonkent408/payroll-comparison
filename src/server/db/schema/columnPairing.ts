import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { columnMapping } from "./columnMapping";
import { comparisons } from "./comparisons";

export const columnPairing = sqliteTable(
  "column_pairing",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    column_mapping_id: text("column_mapping_id")
      .notNull()
      .references(() => columnMapping.id, { onDelete: "cascade" }),
    comparison_id: integer("comparison_id")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    source_type: text("source_type", { enum: ["legacy", "new"] }).notNull(),
    column_name: text("column_name").notNull(),
  },
  (t) => [
    uniqueIndex("column_pairing_unique").on(t.comparison_id, t.source_type, t.column_name),
  ]
);
