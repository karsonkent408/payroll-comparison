import { z } from "zod";
import { COMPARISON_CATEGORIES } from "@/lib/types";

export const reconfigureMappingSchema = z.object({
  legacy_employee_key: z.array(z.string()).min(1),
  new_employee_key: z.array(z.string()).min(1),
  employee_match_mode: z.enum(["exact", "fuzzy"]).default("exact"),
  new_first_name_column: z.string().nullable().optional(),
  new_last_name_column: z.string().nullable().optional(),
  entries: z.array(
    z.object({
      category: z.enum(COMPARISON_CATEGORIES),
      label: z.string(),
      tolerance: z.number().nonnegative(),
      display_order: z.number().int().nonnegative(),
      legacy_columns: z.array(z.string()),
      new_columns: z.array(z.string()),
    })
  ),
});

export type ReconfigureMapping = z.infer<typeof reconfigureMappingSchema>;
