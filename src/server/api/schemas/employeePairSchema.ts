import { z } from "zod";

export const employeePairPostSchema = z.object({
  legacy_key: z.string().min(1),
  new_key: z.string().min(1),
});

export const employeePairPatchSchema = z.object({
  resolved: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

export const employeePairQuerySchema = z.object({
  "key[]": z.union([z.string(), z.array(z.string())]).optional(),
});

export type EmployeePairPost = z.infer<typeof employeePairPostSchema>;
export type EmployeePairPatch = z.infer<typeof employeePairPatchSchema>;
