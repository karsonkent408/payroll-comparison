import { z } from "zod";
import { COMPARISON_CATEGORIES } from "@/lib/types";

export const columnMappingBodySchema = z.object({
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

export type ColumnMappingBody = z.infer<typeof columnMappingBodySchema>;
