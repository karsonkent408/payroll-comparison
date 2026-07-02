import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema";

export const comparisons = sqliteTable("comparisons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  pay_period_start: text("pay_period_start").notNull(),
  pay_period_end: text("pay_period_end").notNull(),
  description: text("description"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  setup_complete: integer("setup_complete").notNull().default(0),
  created_by: text("created_by").references(() => user.id),
  sort_preference: text("sort_preference").notNull().default("last_name"),
  expected_employee_count: integer("expected_employee_count"),
});
