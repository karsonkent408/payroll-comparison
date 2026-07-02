import type { ColumnMapping, MappingEntry, EntryResult, MatchedRow, UnmatchedEmployee, ComparisonResult } from "@/lib/types";
export type { EntryResult, MatchedRow, UnmatchedEmployee, ComparisonResult } from "@/lib/types";
import { normalizeEmployeeKey } from "@/lib/normalizeEmployeeKey";
import { compositeEmployeeKey } from "@/lib/compositeEmployeeKey";

function sumColumns(row: Record<string, string>, columns: string[]): number {
  return columns.reduce((sum, col) => {
    const val = parseFloat(row[col] ?? "");
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
}

function breakdownColumns(row: Record<string, string>, columns: string[]): Record<string, number> | null {
  if (columns.length <= 1) return null;
  const result: Record<string, number> = {};
  for (const col of columns) {
    const val = parseFloat(row[col] ?? "");
    result[col] = isNaN(val) ? 0 : val;
  }
  return result;
}

export function runComparisonForEmployee(
  legacyRow: Record<string, string>,
  newRow: Record<string, string>,
  mapping: ColumnMapping
): EntryResult[] {
  return mapping.entries.map((entry) => {
    const legacy_value = Math.abs(sumColumns(legacyRow, entry.legacy_columns));
    const new_value = Math.abs(sumColumns(newRow, entry.new_columns));
    const difference = legacy_value - new_value;
    const auto_status = difference >= -entry.tolerance && difference <= entry.tolerance ? "resolved" : "unresolved";
    const legacy_breakdown = breakdownColumns(legacyRow, entry.legacy_columns);
    const new_breakdown = breakdownColumns(newRow, entry.new_columns);
    return { entry, legacy_value, legacy_breakdown, new_value, new_breakdown, difference, auto_status };
  });
}

export function runComparison(
  legacyRows: Record<string, string>[],
  newRows: Record<string, string>[],
  mapping: ColumnMapping,
  approvedFuzzyPairs?: Map<string, string>
): ComparisonResult {
  const legacyKey = mapping.legacy_employee_key;
  const newKey = mapping.new_employee_key;

  const legacyByKey = new Map(legacyRows.map((r) => [normalizeEmployeeKey(compositeEmployeeKey(r, legacyKey)), r]));
  const newByKey = new Map(newRows.map((r) => [normalizeEmployeeKey(compositeEmployeeKey(r, newKey)), r]));

  console.log("[runComparison] legacyKey:", JSON.stringify(legacyKey), "newKey:", JSON.stringify(newKey));
  console.log("[runComparison] legacy keys:", [...legacyByKey.keys()].map((k) => JSON.stringify(k)));
  console.log("[runComparison] new keys: ", [...newByKey.keys()].map((k) => JSON.stringify(k)));

  const matched: MatchedRow[] = [];
  const unmatched: UnmatchedEmployee[] = [];

  const consumedLegacy = new Set<string>();
  const consumedNew = new Set<string>();

  if (approvedFuzzyPairs) {
    for (const [legK, mitK] of approvedFuzzyPairs) {
      const normLegK = normalizeEmployeeKey(legK);
      const normMitK = normalizeEmployeeKey(mitK);
      const legacyRow = legacyByKey.get(normLegK);
      const newRow = newByKey.get(normMitK);
      if (!legacyRow || !newRow) continue;

      const results: EntryResult[] = mapping.entries.map((entry) => {
        const legacy_value = Math.abs(sumColumns(legacyRow, entry.legacy_columns));
        const new_value = Math.abs(sumColumns(newRow, entry.new_columns));
        const difference = legacy_value - new_value;
        const auto_status = difference >= -entry.tolerance && difference <= entry.tolerance ? "resolved" : "unresolved";
        const legacy_breakdown = breakdownColumns(legacyRow, entry.legacy_columns);
        const new_breakdown = breakdownColumns(newRow, entry.new_columns);
        return { entry, legacy_value, legacy_breakdown, new_value, new_breakdown, difference, auto_status };
      });

      matched.push({ employee_key: compositeEmployeeKey(legacyRow, legacyKey) || legK, results });
      consumedLegacy.add(normLegK);
      consumedNew.add(normMitK);
    }
  }

  for (const [key, legacyRow] of legacyByKey) {
    if (consumedLegacy.has(key)) continue;
    const newRow = newByKey.get(key);
    console.log(`[runComparison] matching legacy key ${JSON.stringify(key)} → ${newRow ? "FOUND" : "NOT FOUND"}`);
    if (!newRow) {
      unmatched.push({ employee_key: compositeEmployeeKey(legacyRow, legacyKey) || key, source: "legacy" });
      continue;
    }

    const results: EntryResult[] = mapping.entries.map((entry) => {
      const legacy_value = Math.abs(sumColumns(legacyRow, entry.legacy_columns));
      const new_value = Math.abs(sumColumns(newRow, entry.new_columns));
      const difference = legacy_value - new_value;
      const auto_status = difference >= -entry.tolerance && difference <= entry.tolerance ? "resolved" : "unresolved";
      const legacy_breakdown = breakdownColumns(legacyRow, entry.legacy_columns);
      const new_breakdown = breakdownColumns(newRow, entry.new_columns);
      return { entry, legacy_value, legacy_breakdown, new_value, new_breakdown, difference, auto_status };
    });

    matched.push({ employee_key: compositeEmployeeKey(legacyRow, legacyKey) || key, results });
  }

  for (const [key, newRow] of newByKey) {
    if (!legacyByKey.has(key) && !consumedNew.has(key)) {
      unmatched.push({ employee_key: compositeEmployeeKey(newRow, newKey) || key, source: "new" });
    }
  }

  return { matched, unmatched };
}
