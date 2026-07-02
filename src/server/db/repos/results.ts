import { and, eq, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  employeePairing,
  mappingEntries,
  columnMapping,
  columnPairing,
} from "@/server/db/schema";
import type { ComparisonResult, StoredMappingEntry } from "@/lib/types";
import type { SQLiteWriteStatement } from "@/server/db/repos/columnMapping";

export type {
  StoredEntryResult,
  StoredMatchedRow,
  StoredUnmatchedEmployee,
  StoredResults,
} from "@/features/comparisons/types";
import type {
  StoredResults,
  StoredEntryResult,
} from "@/features/comparisons/types";

const CATEGORY_ORDER = sql<number>`CASE ${columnMapping.category}
  WHEN 'Hours'              THEN 0
  WHEN 'Earnings'           THEN 1
  WHEN 'Non-Taxed Earnings' THEN 2
  WHEN 'FICA'               THEN 3
  WHEN 'Benefits'           THEN 4
  WHEN 'Deductions'         THEN 5
  WHEN 'Taxes'              THEN 6
  WHEN 'Fringes'            THEN 7
  WHEN 'Net'                THEN 8
  ELSE 9 END`;

export class ResultsRepository {

  buildPersistStatements(
    comparisonId: number,
    engineResult: ComparisonResult,
    existingMatchedPairings: Map<string, string>,
    newPairingIds: Map<string, string>,
    entryMap: Map<string, StoredMappingEntry>,
    newNameMap: Map<string, string> = new Map(),
    newFirstNameMap: Map<string, string> = new Map(),
    newLastNameMap: Map<string, string> = new Map(),
  ): SQLiteWriteStatement[] {
    const statements: SQLiteWriteStatement[] = [];

    statements.push(
      db.delete(employeePairing).where(
        and(
          eq(employeePairing.comparison_id, comparisonId),
          or(
            isNull(employeePairing.legacy_key),
            isNull(employeePairing.new_key),
          ),
        ),
      ),
    );

    const matchedPairingIds: string[] = [];

    for (const row of engineResult.matched) {
      const legacyKey = row.employee_key;
      const existingId = existingMatchedPairings.get(legacyKey);
      const newId = newPairingIds.get(legacyKey);
      const pairingId = existingId ?? newId;
      if (!pairingId) continue;
      matchedPairingIds.push(pairingId);

      if (!existingId) {
        statements.push(
          db.insert(employeePairing).values({
            id: newId!,
            comparison_id: comparisonId,
            legacy_key: legacyKey,
            new_key: legacyKey,
          }),
        );
      }

      for (const result of row.results) {
        const entryKey = JSON.stringify([
          [...result.entry.legacy_columns].sort(),
          [...result.entry.new_columns].sort(),
        ]);
        const storedEntry = entryMap.get(entryKey);
        if (!storedEntry) continue;

        const legacyBreakdownJson = result.legacy_breakdown
          ? JSON.stringify(result.legacy_breakdown)
          : null;
        const newBreakdownJson = result.new_breakdown
          ? JSON.stringify(result.new_breakdown)
          : null;

        statements.push(
          db.insert(mappingEntries).values({
            comparison_id: comparisonId,
            employee_pairing_id: pairingId,
            column_mapping_id: storedEntry.id,
            auto_status: result.auto_status,
            legacy_value: result.legacy_value,
            legacy_breakdown: legacyBreakdownJson,
            new_value: result.new_value,
            new_breakdown: newBreakdownJson,
            difference: result.difference,
            employee_name: newNameMap.get(legacyKey) ?? null,
            employee_first_name: newFirstNameMap.get(legacyKey) ?? null,
            employee_last_name: newLastNameMap.get(legacyKey) ?? null,
          }).onConflictDoUpdate({
            target: [
              mappingEntries.comparison_id,
              mappingEntries.employee_pairing_id,
              mappingEntries.column_mapping_id,
            ],
            set: {
              auto_status: result.auto_status,
              legacy_value: result.legacy_value,
              legacy_breakdown: legacyBreakdownJson,
              new_value: result.new_value,
              new_breakdown: newBreakdownJson,
              difference: result.difference,
              employee_name: newNameMap.get(legacyKey) ?? null,
              employee_first_name: newFirstNameMap.get(legacyKey) ?? null,
              employee_last_name: newLastNameMap.get(legacyKey) ?? null,
              updated_at: sql`(datetime('now'))`,
            },
          }),
        );
      }
    }

    if (matchedPairingIds.length > 0) {
      statements.push(
        db.delete(mappingEntries).where(
          and(
            eq(mappingEntries.comparison_id, comparisonId),
            notInArray(mappingEntries.employee_pairing_id, matchedPairingIds),
          ),
        ),
      );
      statements.push(
        db.delete(employeePairing).where(
          and(
            eq(employeePairing.comparison_id, comparisonId),
            isNotNull(employeePairing.legacy_key),
            isNotNull(employeePairing.new_key),
            notInArray(employeePairing.id, matchedPairingIds),
          ),
        ),
      );
    } else {
      statements.push(
        db.delete(mappingEntries).where(eq(mappingEntries.comparison_id, comparisonId)),
      );
      statements.push(
        db.delete(employeePairing).where(
          and(
            eq(employeePairing.comparison_id, comparisonId),
            isNotNull(employeePairing.legacy_key),
            isNotNull(employeePairing.new_key),
          ),
        ),
      );
    }

    for (const u of engineResult.unmatched) {
      statements.push(
        db.insert(employeePairing).values({
          id: crypto.randomUUID(),
          comparison_id: comparisonId,
          legacy_key: u.source === "legacy" ? u.employee_key : null,
          new_key: u.source === "new" ? u.employee_key : null,
          employee_name:
            u.source === "new" ? (newNameMap.get(u.employee_key) ?? null) : null,
        }),
      );
    }

    return statements;
  }

  async load(comparisonId: number): Promise<StoredResults> {
    const resultRows = await db
      .select({
        id: mappingEntries.id,
        employee_pairing_id: mappingEntries.employee_pairing_id,
        employee_key: employeePairing.legacy_key,
        employee_name: mappingEntries.employee_name,
        employee_first_name: mappingEntries.employee_first_name,
        employee_last_name: mappingEntries.employee_last_name,
        column_mapping_id: mappingEntries.column_mapping_id,
        auto_status: mappingEntries.auto_status,
        manual_override: mappingEntries.manual_override,
        note: mappingEntries.note,
        legacy_value: mappingEntries.legacy_value,
        legacy_breakdown: mappingEntries.legacy_breakdown,
        new_value: mappingEntries.new_value,
        new_breakdown: mappingEntries.new_breakdown,
        difference: mappingEntries.difference,
        category: columnMapping.category,
        label: columnMapping.label,
        tolerance: columnMapping.tolerance,
        display_order: columnMapping.display_order,
      })
      .from(mappingEntries)
      .innerJoin(
        employeePairing,
        eq(employeePairing.id, mappingEntries.employee_pairing_id),
      )
      .innerJoin(
        columnMapping,
        eq(columnMapping.id, mappingEntries.column_mapping_id),
      )
      .where(eq(mappingEntries.comparison_id, comparisonId))
      .orderBy(
        CATEGORY_ORDER,
        columnMapping.display_order,
        employeePairing.legacy_key,
      )
      .all();

    const columnMappingIds = [
      ...new Set(resultRows.map((r) => r.column_mapping_id)),
    ];
    const pairingRows =
      columnMappingIds.length > 0
        ? await db
            .select()
            .from(columnPairing)
            .where(
              sql`${columnPairing.column_mapping_id} IN (${sql.join(
                columnMappingIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            )
            .all()
        : [];

    const legacyColsMap = new Map<string, string[]>();
    const newColsMap = new Map<string, string[]>();
    for (const p of pairingRows) {
      if (p.source_type === "legacy") {
        legacyColsMap.set(p.column_mapping_id, [
          ...(legacyColsMap.get(p.column_mapping_id) ?? []),
          p.column_name,
        ]);
      } else {
        newColsMap.set(p.column_mapping_id, [
          ...(newColsMap.get(p.column_mapping_id) ?? []),
          p.column_name,
        ]);
      }
    }

    const byEmployee = new Map<
      string,
      {
        name: string | null;
        firstName: string | null;
        lastName: string | null;
        results: StoredEntryResult[];
      }
    >();
    for (const row of resultRows) {
      const empKey = row.employee_key ?? "";
      if (!byEmployee.has(empKey)) {
        byEmployee.set(empKey, {
          name: row.employee_name,
          firstName: row.employee_first_name ?? null,
          lastName: row.employee_last_name ?? null,
          results: [],
        });
      }
      const legacyCols = legacyColsMap.get(row.column_mapping_id) ?? [];
      const newCols = newColsMap.get(row.column_mapping_id) ?? [];
      byEmployee.get(empKey)!.results.push({
        id: row.id,
        column_entry_id: row.column_mapping_id,
        legacy_columns: legacyCols,
        new_columns: newCols,
        category: row.category,
        label: row.label,
        display_order: row.display_order,
        legacy_value: row.legacy_value,
        legacy_breakdown:
          legacyCols.length > 1 && row.legacy_breakdown
            ? JSON.parse(row.legacy_breakdown)
            : null,
        new_value: row.new_value,
        new_breakdown:
          newCols.length > 1 && row.new_breakdown
            ? JSON.parse(row.new_breakdown)
            : null,
        difference: row.difference,
        tolerance: row.tolerance,
        auto_status: row.auto_status,
        manual_override: row.manual_override,
        note: row.note,
      });
    }

    const matched = Array.from(byEmployee.entries()).map(
      ([employee_key, { name, firstName, lastName, results }]) => ({
        employee_key,
        employee_name: name,
        employee_first_name: firstName,
        employee_last_name: lastName,
        results,
      }),
    );

    const unmatchedRows = await db
      .select()
      .from(employeePairing)
      .where(
        and(
          eq(employeePairing.comparison_id, comparisonId),
          or(
            isNull(employeePairing.legacy_key),
            isNull(employeePairing.new_key),
          ),
        ),
      )
      .all();

    const unmatched = unmatchedRows.map((r) => ({
      id: r.id,
      employee_key: r.legacy_key ?? r.new_key ?? "",
      employee_name: r.employee_name ?? null,
      source_type: r.legacy_key ? ("legacy" as const) : ("new" as const),
      resolved: r.resolved,
      note: r.note,
    }));

    return { matched, unmatched };
  }
}

export const resultRepo = new ResultsRepository()