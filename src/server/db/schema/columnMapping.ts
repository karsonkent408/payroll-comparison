import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { comparisons } from "./comparisons";
import type { ComparisonCategory } from "@/lib/types";

export const columnMapping = sqliteTable("column_mapping", {
  id: text("id").primaryKey(),
  comparison_id: integer("comparison_id")
    .notNull()
    .references(() => comparisons.id, { onDelete: "cascade" }),
  category: text("category").notNull().$type<ComparisonCategory>(),
  display_order: integer("display_order").notNull().default(0),
  label: text("label").notNull().default(""),
  tolerance: real("tolerance").notNull().default(0.01),
});
