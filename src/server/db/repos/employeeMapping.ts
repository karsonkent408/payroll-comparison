import { eq } from "drizzle-orm";
import {
  db
} from "@/server/db";
import { employeeMapping } from "@/server/db/schema";
import type { StoredColumnMapping, ComparisonCategory, EmployeeMatchMode } from "@/lib/types";
import { columnMappingRepo } from "@/server/db/repos/columnMapping";
import type { SQLiteWriteStatement } from "@/server/db/repos/columnMapping";
import type { StoredColumnMappingEntry } from "@/server/api/util/types";

export type EmployeeMappingInput = {
  legacy_employee_key: string[];
  new_employee_key: string[];
  employee_match_mode: "exact" | "fuzzy";
  new_first_name_column: string | null;
  new_last_name_column: string | null;
};

export type StoredEmployeeMapping = Omit<
  typeof employeeMapping.$inferSelect,
  "legacy_employee_key" | "new_employee_key"
> & {
  legacy_employee_key: string[];
  new_employee_key: string[];
};

export type MappingInput = {
  legacy_employee_key: string[];
  new_employee_key: string[];
  employee_match_mode?: EmployeeMatchMode;
  new_first_name_column?: string | null;
  new_last_name_column?: string | null;
  entries: {
    legacy_columns: string[];
    new_columns: string[];
    tolerance: number;
    category: ComparisonCategory;
    label?: string;
  }[];
};

export class EmployeeMappingRepository {

  private deserialize(row: typeof employeeMapping.$inferSelect): StoredEmployeeMapping {
    return {
      ...row,
      legacy_employee_key: JSON.parse(row.legacy_employee_key) as string[],
      new_employee_key: JSON.parse(row.new_employee_key) as string[],
    };
  }

  private toStoredColumnMapping(empRow: StoredEmployeeMapping, colEntries: StoredColumnMappingEntry[] | null): StoredColumnMapping {
    return {
      id: empRow.id,
      comparison_id: empRow.comparison_id,
      legacy_employee_key: empRow.legacy_employee_key,
      new_employee_key: empRow.new_employee_key,
      employee_match_mode: empRow.employee_match_mode as EmployeeMatchMode,
      new_first_name_column: empRow.new_first_name_column,
      new_last_name_column: empRow.new_last_name_column,
      created_at: "",
      updated_at: "",
      entries: (colEntries ?? []).map((e) => ({
        id: e.id,
        mapping_id: e.comparison_id,
        legacy_columns: e.legacy_columns,
        new_columns: e.new_columns,
        tolerance: e.tolerance,
        category: e.category as ComparisonCategory,
        display_order: e.display_order,
        label: e.label,
      })),
    };
  }

  async findByComparisonId(comparison_id: number): Promise<StoredEmployeeMapping | null> {
    const [row] = await db
      .select()
      .from(employeeMapping)
      .where(eq(employeeMapping.comparison_id, comparison_id));

    if (!row) return null;
    return this.deserialize(row);
  }

  buildUpsertStatements(comparison_id: number, input: EmployeeMappingInput): SQLiteWriteStatement[] {
    return [
      db.delete(employeeMapping).where(eq(employeeMapping.comparison_id, comparison_id)),
      db.insert(employeeMapping).values({
        comparison_id,
        legacy_employee_key: JSON.stringify(input.legacy_employee_key),
        new_employee_key: JSON.stringify(input.new_employee_key),
        employee_match_mode: input.employee_match_mode,
        new_first_name_column: input.new_first_name_column ?? null,
        new_last_name_column: input.new_last_name_column ?? null,
      }),
    ];
  }

  async upsert(comparison_id: number, input: EmployeeMappingInput): Promise<StoredEmployeeMapping> {
    await db.delete(employeeMapping).where(eq(employeeMapping.comparison_id, comparison_id));

    const [row] = await db
      .insert(employeeMapping)
      .values({
        comparison_id,
        legacy_employee_key: JSON.stringify(input.legacy_employee_key),
        new_employee_key: JSON.stringify(input.new_employee_key),
        employee_match_mode: input.employee_match_mode,
        new_first_name_column: input.new_first_name_column ?? null,
        new_last_name_column: input.new_last_name_column ?? null,
      })
      .returning();

    return this.deserialize(row);
  }

  async getMapping(comparison_id: number): Promise<StoredColumnMapping | null> {
    const empRow = await this.findByComparisonId(comparison_id);
    if (!empRow) return null;
    const colEntries = await columnMappingRepo.findByComparisonId(comparison_id);
    return this.toStoredColumnMapping(empRow, colEntries);
  }

  async upsertMapping(comparison_id: number, input: MappingInput): Promise<StoredColumnMapping> {
    const empRow = await this.upsert(comparison_id, {
      legacy_employee_key: input.legacy_employee_key,
      new_employee_key: input.new_employee_key,
      employee_match_mode: input.employee_match_mode ?? "exact",
      new_first_name_column: input.new_first_name_column ?? null,
      new_last_name_column: input.new_last_name_column ?? null,
    });

    const categoryCounters = new Map<string, number>();
    const entryInputs = input.entries.map((e) => {
      const order = categoryCounters.get(e.category) ?? 0;
      categoryCounters.set(e.category, order + 1);
      return {
        category: e.category,
        label: e.label ?? "",
        tolerance: e.tolerance,
        display_order: order,
        legacy_columns: e.legacy_columns,
        new_columns: e.new_columns,
      };
    });

    const colEntries = await columnMappingRepo.upsert(comparison_id, entryInputs);
    return this.toStoredColumnMapping(empRow, colEntries);
  }
}

export const employeeMappingRepo = new EmployeeMappingRepository()