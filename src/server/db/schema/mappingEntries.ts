import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { comparisons } from "./comparisons";
import { employeePairing } from "./employeePairing";
import { columnMapping } from "./columnMapping";

export const mappingEntries = sqliteTable(
  "mapping_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comparison_id: integer("comparison_id")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    employee_pairing_id: text("employee_pairing_id")
      .notNull()
      .references(() => employeePairing.id, { onDelete: "cascade" }),
    column_mapping_id: text("column_mapping_id")
      .notNull()
      .references(() => columnMapping.id, { onDelete: "cascade" }),
    legacy_value: real("legacy_value").notNull().default(0),
    legacy_breakdown: text('legacy_breakdown'),
    new_value: real("new_value").notNull().default(0),
    new_breakdown: text('new_breakdown'),
    difference: real("difference").notNull().default(0),
    auto_status: text("auto_status", { enum: ["resolved", "unresolved"] }).notNull(),
    manual_override: text("manual_override", { enum: ["resolved", "unresolved"] }),
    note: text("note"),
    employee_name: text("employee_name"),
    employee_first_name: text('employee_first_name'),
    employee_last_name: text('employee_last_name'),
    updated_at: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("mapping_entries_unique").on(
      t.comparison_id,
      t.employee_pairing_id,
      t.column_mapping_id
    ),
  ]
);
