import * as xlsx from "xlsx";
import type { StoredResults } from "@/server/db/repos/results";
import type { StoredColumnMapping, Source } from "@/lib/types";

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

export function comparisonExportDynamic(
  results: StoredResults,
  mapping: StoredColumnMapping,
  _comparison: { label: string; pay_period_start: string; pay_period_end: string },
  newSource: Source,
  pairings: { legacy_key: string; new_key: string }[]
): ArrayBuffer {
  const entries = orderedEntries(mapping);
  const wb = xlsx.utils.book_new();

  // --- Legacy sheet ---
  const legacyHeader = ["Employee ID", ...entries.map((e) => e.label)];
  const legacyRows = results.matched.map((emp) => {
    const row: unknown[] = [emp.employee_key];
    for (const entry of entries) {
      const r = emp.results.find((x) => x.column_entry_id === entry.id);
      row.push(r ? r.legacy_value : "");
    }
    return row;
  });
  const legacyWs = xlsx.utils.aoa_to_sheet([legacyHeader, ...legacyRows]);
  xlsx.utils.book_append_sheet(wb, legacyWs, "Legacy");

  // --- New sheet (full CSV replica + hidden __key__ helper column) ---
  const newHeader = [...newSource.headers, "__key__"];
  const newRows = newSource.rows.map((row) => [...newSource.headers.map((h) => row[h] ?? ""), null]);
  const newWs = xlsx.utils.aoa_to_sheet([newHeader, ...newRows]);

  // Inject INDEX/MATCH formula into __key__ data cells — one per source row
  const keyFormula = mapping.new_employee_key
    .map((col) => `INDEX($1:$1048576,ROW(),MATCH(${JSON.stringify(col)},$1:$1,0))`)
    .join('&" "&');
  const keyColIdx = newSource.headers.length;
  for (let r = 0; r < newSource.rows.length; r++) {
    newWs[xlsx.utils.encode_cell({ r: r + 1, c: keyColIdx })] = { t: "s", f: keyFormula, v: "" };
  }

  // Hide __key__ column
  newWs["!cols"] = newSource.headers.map(() => ({}));
  newWs["!cols"].push({ wch: 0 });

  xlsx.utils.book_append_sheet(wb, newWs, "New");

  // --- Summary sheet ---
  // Row 0: category header row (merged cells per category)
  // Row 1: entry label row
  // Row 2+: data rows (matched employees with formula cells, then unmatched static)
  // Cols 0-1: hidden __legacy_key__ / __new_key__; cols 2-3: Employee ID / Employee Name; cols 4+: entry groups

  const SUMMARY_DATA_OFFSET = 4; // number of fixed cols before entry groups

  const categoryHeaderRow: (string | null)[] = [null, null, null, null];
  const entryLabelRow: string[] = ["__legacy_key__", "__new_key__", "Employee ID", "Employee Name"];
  const merges: xlsx.Range[] = [];

  let colIdx = SUMMARY_DATA_OFFSET;
  let prevCategory: string | null = null;
  let categoryStart = SUMMARY_DATA_OFFSET;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isNewCategory = entry.category !== prevCategory;
    if (isNewCategory) {
      if (prevCategory !== null) {
        merges.push({ s: { r: 0, c: categoryStart }, e: { r: 0, c: colIdx - 1 } });
      }
      categoryHeaderRow.push(entry.category);
      categoryStart = colIdx;
      prevCategory = entry.category;
    } else {
      categoryHeaderRow.push(null);
    }
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
  if (prevCategory !== null) {
    merges.push({ s: { r: 0, c: categoryStart }, e: { r: 0, c: colIdx - 1 } });
  }

  // Build Summary AOA with placeholders for formula cells (set directly on ws after aoa_to_sheet).
  // Summary data rows start at sheet row index 2 (Excel row 3).
  const summaryDataRows: unknown[][] = [];

  for (let k = 0; k < results.matched.length; k++) {
    const emp = results.matched[k];
    const newKey = pairings.find((p) => p.legacy_key === emp.employee_key)?.new_key ?? emp.employee_key;
    const row: unknown[] = [emp.employee_key, newKey, emp.employee_key, emp.employee_name ?? ""];
    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      const result = emp.results.find((r) => r.column_entry_id === entry.id);
      const statusValue = result?.manual_override ?? null;
      const note = result ? (result.note ?? "") : "";
      row.push(null, null, null, statusValue, note);
    }
    summaryDataRows.push(row);
  }

  for (const unmatched of results.unmatched) {
    const row: unknown[] = [unmatched.employee_key, "", unmatched.employee_key, unmatched.employee_name ?? ""];
    for (let i = 0; i < entries.length; i++) {
      row.push("", "", "", "", "");
    }
    summaryDataRows.push(row);
  }

  const summaryAoa = [categoryHeaderRow, entryLabelRow, ...summaryDataRows];
  const summaryWs = xlsx.utils.aoa_to_sheet(summaryAoa);

  // Hide __legacy_key__ (col 0) and __new_key__ (col 1)
  summaryWs["!cols"] = [{ wch: 0 }, { wch: 0 }];

  // Inject formula cells directly — aoa_to_sheet (xlsx 0.18.x) does not support cell objects in arrays.
  for (let k = 0; k < results.matched.length; k++) {
    const summaryExcelRow = k + 3; // Summary data row (1-indexed Excel, 2 header rows)
    const summaryRowIdx = k + 2;   // 0-indexed row in Summary worksheet

    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      const summaryLegacyCol = xlsx.utils.encode_col(SUMMARY_DATA_OFFSET + ei * 5);
      const summaryNewCol = xlsx.utils.encode_col(SUMMARY_DATA_OFFSET + 1 + ei * 5);

      // XLOOKUP formulas: look up by employee key (col A/B) and column header name.
      // $A = __legacy_key__, $B = __new_key__ in Summary.
      const legacyLookupArr = `XLOOKUP("Employee ID",Legacy!$1:$1,Legacy!$A:$XFD)`;
      const legacyReturnArr = `XLOOKUP(${JSON.stringify(entry.label)},Legacy!$1:$1,Legacy!$A:$XFD)`;
      const legacyF = `XLOOKUP($A${summaryExcelRow},${legacyLookupArr},${legacyReturnArr})`;

      const newKeyArr = `XLOOKUP("__key__",New!$1:$1,New!$A:$XFD)`;
      const newF = entry.new_columns
        .map((col) => `XLOOKUP($B${summaryExcelRow},${newKeyArr},XLOOKUP(${JSON.stringify(col)},New!$1:$1,New!$A:$XFD))`)
        .join("+");

      // xlsx 0.18.x drops formula cells without a cached v; v:0 satisfies the writer.
      summaryWs[xlsx.utils.encode_cell({ r: summaryRowIdx, c: SUMMARY_DATA_OFFSET + ei * 5 })] =
        { t: "n", f: legacyF, v: 0 };
      summaryWs[xlsx.utils.encode_cell({ r: summaryRowIdx, c: SUMMARY_DATA_OFFSET + 1 + ei * 5 })] =
        { t: "n", f: newF, v: 0 };
      summaryWs[xlsx.utils.encode_cell({ r: summaryRowIdx, c: SUMMARY_DATA_OFFSET + 2 + ei * 5 })] =
        { t: "n", f: `${summaryLegacyCol}${summaryExcelRow}-${summaryNewCol}${summaryExcelRow}`, v: 0 };

      const entryResult = results.matched[k].results.find((r) => r.column_entry_id === entries[ei].id);
      if (!entryResult?.manual_override) {
        const summaryDiffCol = xlsx.utils.encode_col(SUMMARY_DATA_OFFSET + 2 + ei * 5);
        const diffRef = `${summaryDiffCol}${summaryExcelRow}`;
        const tol = entries[ei].tolerance;
        summaryWs[xlsx.utils.encode_cell({ r: summaryRowIdx, c: SUMMARY_DATA_OFFSET + 3 + ei * 5 })] = {
          t: "s",
          f: `IF(AND(${diffRef}>=-${tol},${diffRef}<=${tol}),"resolved","unresolved")`,
          v: entryResult?.auto_status ?? "unresolved",
        };
      }
    }
  }

  if (merges.length > 0) summaryWs["!merges"] = merges;

  xlsx.utils.book_append_sheet(wb, summaryWs, "Summary");

  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
