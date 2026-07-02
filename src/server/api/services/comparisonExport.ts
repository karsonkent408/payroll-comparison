import * as xlsx from "xlsx";
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

export function comparisonExport(
  results: StoredResults,
  mapping: StoredColumnMapping,
  comparison: { label: string; pay_period_start: string; pay_period_end: string }
): ArrayBuffer {
  const entries = orderedEntries(mapping);

  // Row 0: category header (merged cells per category)
  // Row 1: entry labels (Employee ID, Employee Name, then 5 sub-cols per entry)
  // Row 2+: data rows

  const categoryHeaderRow: (string | null)[] = [null, null];
  const entryLabelRow: string[] = ["Employee ID", "Employee Name"];
  const merges: xlsx.Range[] = [];

  let colIdx = 2;
  let prevCategory: string | null = null;
  let categoryStart = 2;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isNewCategory = entry.category !== prevCategory;

    if (isNewCategory) {
      // Close out previous category merge (if any)
      if (prevCategory !== null) {
        merges.push({ s: { r: 0, c: categoryStart }, e: { r: 0, c: colIdx - 1 } });
      }
      categoryHeaderRow.push(entry.category);
      categoryStart = colIdx;
      prevCategory = entry.category;
    } else {
      categoryHeaderRow.push(null);
    }
    // 4 more nulls for the remaining sub-columns of this entry
    categoryHeaderRow.push(null, null, null, null);

    entryLabelRow.push(
      `${entry.label} Legacy`,
      `${entry.label} New`,
      `${entry.label} Difference`,
      `${entry.label} Status`,
      `${entry.label} Notes`
    );

    colIdx += 5;
  }

  // Close the last category
  if (prevCategory !== null) {
    merges.push({ s: { r: 0, c: categoryStart }, e: { r: 0, c: colIdx - 1 } });
  }

  const dataRows: unknown[][] = [];

  for (const employee of results.matched) {
    const row: unknown[] = [employee.employee_key, employee.employee_name];
    for (const entry of entries) {
      const result = employee.results.find((r) => r.column_entry_id === entry.id);
      if (result) {
        const status = result.manual_override ?? result.auto_status;
        const difference = result.legacy_value - result.new_value;
        row.push(result.legacy_value, result.new_value, difference, status, result.note ?? "");
      } else {
        row.push("", "", "", "", "");
      }
    }
    dataRows.push(row);
  }

  for (const unmatched of results.unmatched) {
    const row: unknown[] = [unmatched.employee_key, unmatched.employee_name, unmatched.source_type];
    for (let i = 0; i < entries.length; i++) {
      row.push(null, null, null, null, null);
    }
    dataRows.push(row);
  }

  const aoa = [categoryHeaderRow, entryLabelRow, ...dataRows];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(aoa);

  if (merges.length > 0) ws["!merges"] = merges;

  // Frozen panes: written to xlsx correctly but !views is not round-tripped by SheetJS CE reader
  ws["!views"] = [{ state: "frozen", xSplit: 2, ySplit: 0 }];

  // Apply currency format to Legacy, New, Difference columns for each data row
  // Data starts at row 2 (row 0 = category header, row 1 = entry labels)
  const dataRowStart = 2;
  const totalRows = dataRowStart + results.matched.length + results.unmatched.length;
  for (let rowIdx = dataRowStart; rowIdx < totalRows; rowIdx++) {
    for (let entryIdx = 0; entryIdx < entries.length; entryIdx++) {
      const baseCol = 2 + entryIdx * 5;
      for (const colOffset of [0, 1, 2]) { // Legacy, New, Difference
        const cellRef = xlsx.utils.encode_cell({ r: rowIdx, c: baseCol + colOffset });
        if (ws[cellRef]) ws[cellRef].z = "$#,##0.00";
      }
    }
  }

  xlsx.utils.book_append_sheet(wb, ws, "Results");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
