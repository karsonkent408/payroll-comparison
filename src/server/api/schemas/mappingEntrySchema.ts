import { z } from "zod";

export const mappingEntryParamSchema = z.object({
  id: z.coerce.number().int(),
  mappingEntryId: z.coerce.number().int(),
});

export const mappingEntryPatchSchema = z.object({
  manual_override: z.enum(["resolved", "unresolved"]).nullable().optional(),
  note: z.string().nullable().optional(),
  legacy_value: z.number().optional(),
});

export type MappingEntryPatch = z.infer<typeof mappingEntryPatchSchema>;
