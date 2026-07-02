import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { comparisons } from "./comparisons";

export const employeePairing = sqliteTable(
  "employee_pairings",
  {
    id: text("id").primaryKey(),
    comparison_id: integer("comparison_id")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    legacy_key: text("legacy_key"),
    new_key: text("new_key"),
    employee_name: text("employee_name"),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
  },
  (t) => [
    check("employee_pairings_not_null_null", sql`${t.legacy_key} IS NOT NULL OR ${t.new_key} IS NOT NULL`),
    uniqueIndex("employee_pairings_legacy_unique").on(t.comparison_id, t.legacy_key),
    uniqueIndex("employee_pairings_new_unique").on(t.comparison_id, t.new_key),
  ]
);
