import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { employeeMapping } from "@/server/db/schema";

const baseInsertSchema = createInsertSchema(employeeMapping);

export const employeeMappingBodySchema = baseInsertSchema
  .omit({ id: true, comparison_id: true, legacy_employee_key: true, new_employee_key: true })
  .extend({
    legacy_employee_key: z.array(z.string()).min(1),
    new_employee_key: z.array(z.string()).min(1),
    new_first_name_column: z.string().nullable().optional(),
    new_last_name_column: z.string().nullable().optional(),
  });

export type EmployeeMappingBody = z.infer<typeof employeeMappingBodySchema>;
