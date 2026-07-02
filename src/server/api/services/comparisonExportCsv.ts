import type { StoredResults } from "@/server/db/repos/results";
import type { StoredColumnMapping } from "@/lib/types";

const CATEGORY_ORDER = [
  "Hours",
  "Earnings",
  "Non-Taxed Earnings",
  "FICA",
  "Benefits",
  "Deductions",
  "Taxes",
  "Fringes",
  "Net",
] as const;

function orderedEntries(mapping: StoredColumnMapping) {
  return [...mapping.entries].sort((a, b) => {
    const catA = CATEGORY_ORDER.indexOf(a.category as typeof CATEGORY_ORDER[number]);
    const catB = CATEGORY_ORDER.indexOf(b.category as typeof CATEGORY_ORDER[number]);
    if (catA !== catB) return catA - catB;
    return a.display_order - b.display_order;
  });
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

export function comparisonExportCsv(
  results: StoredResults,
  mapping: StoredColumnMapping,
  _comparison: { label: string; pay_period_start: string; pay_period_end: string }
): string {
  const entries = orderedEntries(mapping);

  const header: string[] = ["Employee ID", "Employee Name"];
  for (const entry of entries) {
    header.push(
      `${entry.category} - ${entry.label} Legacy`,
      `${entry.category} - ${entry.label} New`,
      `${entry.category} - ${entry.label} Difference`,
      `${entry.category} - ${entry.label} Status`,
      `${entry.category} - ${entry.label} Notes`
    );
  }

  const rows: string[] = [csvRow(header)];

  for (const employee of results.matched) {
    const cells: (string | number | null)[] = [employee.employee_key, employee.employee_name];
    for (const entry of entries) {
      const result = employee.results.find((r) => r.column_entry_id === entry.id);
      if (result) {
        const status = result.manual_override ?? result.auto_status;
        const difference = result.legacy_value - result.new_value;
        cells.push(result.legacy_value, result.new_value, difference, status, result.note ?? "");
      } else {
        cells.push("", "", "", "", "");
      }
    }
    rows.push(csvRow(cells));
  }

  for (const unmatched of results.unmatched) {
    const cells: (string | number | null)[] = [unmatched.employee_key, unmatched.employee_name];
    for (let i = 0; i < entries.length; i++) {
      cells.push("", "", "", "", "");
    }
    rows.push(csvRow(cells));
  }

  return rows.join("\n");
}
