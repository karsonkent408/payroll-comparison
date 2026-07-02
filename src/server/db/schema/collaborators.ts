import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { comparisons } from "./comparisons";
import { user } from "./auth-schema";
import { sql } from "drizzle-orm";

export const collaborator = sqliteTable(
  "collaborator",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comparisonId: integer('comparison_id').notNull().references(() => comparisons.id, { onDelete: "cascade" }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade'}),
    access: text('access').notNull().default('viewer'), // 'viewer', 'editor', 'owner'
    createdBy: text('created_by').notNull().references(() => user.id, { onDelete: 'cascade'}),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`)
  },
  (t) => [
    uniqueIndex("collaborator_one_owner_per_comparison")
      .on(t.comparisonId)
      .where(sql`${t.access} = 'owner'`),
    uniqueIndex("collaborator_unique_user_per_comparison")
      .on(t.comparisonId, t.userId),
  ]
);
