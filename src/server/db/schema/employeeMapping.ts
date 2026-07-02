import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { comparisons } from "./comparisons";

export const employeeMapping = sqliteTable("employee_mapping", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  comparison_id: integer("comparison_id")
    .notNull()
    .unique()
    .references(() => comparisons.id, { onDelete: "cascade" }),
  legacy_employee_key: text("legacy_employee_key").notNull(),
  new_employee_key: text("new_employee_key").notNull(),
  employee_match_mode: text("employee_match_mode", { enum: ["exact", "fuzzy"] })
    .notNull()
    .default("exact"),
  new_first_name_column: text("new_first_name_column"),
  new_last_name_column: text("new_last_name_column"),
});
