import { test, expect, describe } from "bun:test";
import * as xlsx from "xlsx";
import { comparisonExport } from "@/server/api/services/comparisonExport";
import type { StoredResults } from "@/server/db/repos/results";
import type { StoredColumnMapping } from "@/lib/types";

const baseMapping: StoredColumnMapping = {
  id: 1,
  comparison_id: 1,
  legacy_employee_key: ["emp_id"],
  new_employee_key: ["employee_id"],
  employee_match_mode: "exact",
  new_first_name_column: "First Name",
  new_last_name_column: "Last Name",
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  entries: [
    {
      id: "1",
      mapping_id: 1,
      legacy_columns: ["gross"],
      new_columns: ["gross_pay"],
      tolerance: 0.01,
      category: "Earnings",
      display_order: 0,
      label: "Gross",
    },
  ],
};

const baseResults: StoredResults = {
  matched: [
    {
      employee_key: "101",
      employee_name: "Alice Smith",
      results: [
        {
          id: 1,
          column_entry_id: "1",
          legacy_columns: ["gross"],
          new_columns: ["gross_pay"],
          category: "Earnings",
          label: "Gross",
          display_order: 0,
          legacy_value: 1000,
          legacy_breakdown: null,
          new_value: 1000,
          new_breakdown: null,
          difference: 0,
          tolerance: 0.01,
          auto_status: "resolved",
          manual_override: null,
          note: null,
        },
      ],
    },
  ],
  unmatched: [],
};

const baseComparison = { label: "Jan 2024", pay_period_start: "2024-01-01", pay_period_end: "2024-01-31" };

describe("comparisonExport", () => {
  test("returns an ArrayBuffer for valid input", () => {
    const result = comparisonExport(baseResults, baseMapping, baseComparison);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  test("MappingEntries appear in ComparisonCategory order — Hours before Earnings", () => {
    const mapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { id: "2", mapping_id: 1, legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0.01, category: "Earnings", display_order: 0, label: "Gross" },
        { id: "1", mapping_id: 1, legacy_columns: ["hours"], new_columns: ["hours_paid"], tolerance: 0, category: "Hours", display_order: 0, label: "Hours" },
      ],
    };
    const results: StoredResults = {
      matched: [{
        employee_key: "101",
        employee_name: null,
        results: [
          { id: 1, column_entry_id: "1", legacy_columns: ["hours"], new_columns: ["hours_paid"], category: "Hours", label: "Hours", display_order: 0, legacy_value: 40, legacy_breakdown: null, new_value: 40, new_breakdown: null, difference: 0, tolerance: 0, auto_status: "resolved", manual_override: null, note: null },
          { id: 2, column_entry_id: "2", legacy_columns: ["gross"], new_columns: ["gross_pay"], category: "Earnings", label: "Gross", display_order: 0, legacy_value: 1000, legacy_breakdown: null, new_value: 1000, new_breakdown: null, difference: 0, tolerance: 0.01, auto_status: "resolved", manual_override: null, note: null },
        ],
      }],
      unmatched: [],
    };

    const buf = comparisonExport(results, mapping, baseComparison);
    const wb = xlsx.read(buf, { type: "buffer" });
    const ws = wb.Sheets["Results"];
    const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];
    const header = rows[1] as string[]; // row 0 = category header, row 1 = entry labels

    const hoursIdx = header.findIndex((h) => h.startsWith("Hours"));
    const earningsIdx = header.findIndex((h) => h.startsWith("Gross"));
    expect(hoursIdx).toBeGreaterThan(-1);
    expect(earningsIdx).toBeGreaterThan(-1);
    expect(hoursIdx).toBeLessThan(earningsIdx);
  });

  test("within a category, MappingEntries appear in display_order", () => {
    const mapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { id: "2", mapping_id: 1, legacy_columns: ["bonus"], new_columns: ["bonus_pay"], tolerance: 0.01, category: "Earnings", display_order: 1, label: "Bonus" },
        { id: "1", mapping_id: 1, legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0.01, category: "Earnings", display_order: 0, label: "Gross" },
      ],
    };
    const results: StoredResults = {
      matched: [{
        employee_key: "101",
        employee_name: null,
        results: [
          { id: 1, column_entry_id: "1", legacy_columns: ["gross"], new_columns: ["gross_pay"], category: "Earnings", label: "Gross", display_order: 0, legacy_value: 1000, legacy_breakdown: null, new_value: 1000, new_breakdown: null, difference: 0, tolerance: 0.01, auto_status: "resolved", manual_override: null, note: null },
          { id: 2, column_entry_id: "2", legacy_columns: ["bonus"], new_columns: ["bonus_pay"], category: "Earnings", label: "Bonus", display_order: 1, legacy_value: 100, legacy_breakdown: null, new_value: 100, new_breakdown: null, difference: 0, tolerance: 0.01, auto_status: "resolved", manual_override: null, note: null },
        ],
      }],
      unmatched: [],
    };

    const buf = comparisonExport(results, mapping, baseComparison);
    const wb = xlsx.read(buf, { type: "buffer" });
    const ws = wb.Sheets["Results"];
    const header = (xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][])[1] as string[]; // row 0 = category header

    const grossIdx = header.findIndex((h) => h.startsWith("Gross"));
    const bonusIdx = header.findIndex((h) => h.startsWith("Bonus"));
    expect(grossIdx).toBeLessThan(bonusIdx);
  });

  test("Difference is signed — positive when Legacy is higher, negative when New is higher", () => {
    const legacyHigher: StoredResults = {
      matched: [{
        employee_key: "101", employee_name: null,
        results: [{ ...baseResults.matched[0].results[0], legacy_value: 1050, new_value: 1000, difference: 50 }],
      }],
      unmatched: [],
    };
    const newHigher: StoredResults = {
      matched: [{
        employee_key: "101", employee_name: null,
        results: [{ ...baseResults.matched[0].results[0], legacy_value: 1000, new_value: 1050, difference: 50 }],
      }],
      unmatched: [],
    };

    const parseFirstDiff = (buf: ArrayBuffer) => {
      const wb = xlsx.read(buf, { type: "buffer" });
      const rows = xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets["Results"], { header: 1 }) as unknown[][];
      return (rows[2] as unknown[])[4]; // row 0 = category header, row 1 = entry labels, row 2 = first data row
    };

    expect(parseFirstDiff(comparisonExport(legacyHigher, baseMapping, baseComparison))).toBe(50);
    expect(parseFirstDiff(comparisonExport(newHigher, baseMapping, baseComparison))).toBe(-50);
  });

  test("effective DiscrepancyStatus: manual_override takes precedence over auto_status", () => {
    const results: StoredResults = {
      matched: [{
        employee_key: "101", employee_name: null,
        results: [{
          ...baseResults.matched[0].results[0],
          auto_status: "unresolved",
          manual_override: "resolved",
        }],
      }],
      unmatched: [],
    };

    const buf = comparisonExport(results, baseMapping, baseComparison);
    const wb = xlsx.read(buf, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets["Results"], { header: 1 }) as unknown[][];
    const statusCell = (rows[2] as unknown[])[5]; // row 0 = category header, row 1 = entry labels, row 2 = first data row
    expect(statusCell).toBe("resolved");
  });

  test("UnmatchedEmployees appear after matched rows with blank MappingEntry columns and source type shown", () => {
    const results: StoredResults = {
      matched: [{ employee_key: "101", employee_name: "Alice Smith", results: [{ ...baseResults.matched[0].results[0] }] }],
      unmatched: [
        { id: "1", employee_key: "999", employee_name: null, source_type: "legacy", resolved: false, note: null },
      ],
    };

    const buf = comparisonExport(results, baseMapping, baseComparison);
    const wb = xlsx.read(buf, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets["Results"], { header: 1, defval: null }) as unknown[][];

    // row index 0 = category header, 1 = entry labels, 2 = matched employee, 3 = unmatched
    expect(rows).toHaveLength(4);
    const unmatchedRow = rows[3] as unknown[];
    expect(unmatchedRow[0]).toBe("999");           // Employee ID
    expect(unmatchedRow[1]).toBeNull();             // Employee Name (null → blank)
    // MappingEntry columns should be blank (null with defval: null)
    expect(unmatchedRow[4]).toBeNull();             // Difference column
    expect(unmatchedRow[5]).toBeNull();             // Status column
  });

  test("null EmployeeName produces a blank cell — no placeholder", () => {
    const results: StoredResults = {
      matched: [{ employee_key: "101", employee_name: null, results: [{ ...baseResults.matched[0].results[0] }] }],
      unmatched: [],
    };

    const buf = comparisonExport(results, baseMapping, baseComparison);
    const wb = xlsx.read(buf, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets["Results"], { header: 1, defval: null }) as unknown[][];
    expect((rows[2] as unknown[])[1]).toBeNull(); // row 0 = category header, row 1 = entry labels, row 2 = first data row
  });

  test("Legacy, New, and Difference cells use currency number format", () => {
    const buf = comparisonExport(baseResults, baseMapping, baseComparison);
    const wb = xlsx.read(buf, { type: "buffer", cellNF: true });
    const ws = wb.Sheets["Results"];

    // Data starts at row 2 (0-indexed). Legacy=col2, New=col3, Difference=col4
    const legacyCell = ws[xlsx.utils.encode_cell({ r: 2, c: 2 })];
    const newCell  = ws[xlsx.utils.encode_cell({ r: 2, c: 3 })];
    const diffCell   = ws[xlsx.utils.encode_cell({ r: 2, c: 4 })];

    expect(legacyCell?.z).toContain("#,##0");
    expect(newCell?.z).toContain("#,##0");
    expect(diffCell?.z).toContain("#,##0");
  });

  test("ComparisonCategory name appears in a merged cell spanning its MappingEntry sub-columns", () => {
    const buf = comparisonExport(baseResults, baseMapping, baseComparison);
    const wb = xlsx.read(buf, { type: "buffer" });
    const ws = wb.Sheets["Results"];

    // ws['!merges'] should contain at least one merge region for the Earnings category
    const merges = ws["!merges"] ?? [];
    expect(merges.length).toBeGreaterThan(0);

    // The merge should span 5 columns (Legacy, New, Difference, Status, Notes)
    const categoryMerge = merges.find((m) => m.e.c - m.s.c === 4);
    expect(categoryMerge).toBeDefined();
  });

  test("matched employees appear as rows with Employee ID and Employee Name in the first two columns", () => {
    const result = comparisonExport(baseResults, baseMapping, baseComparison);
    const wb = xlsx.read(result, { type: "buffer" });
    const ws = wb.Sheets["Results"];
    const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

    // find the row for employee 101
    const dataRow = rows.find((r) => r[0] === "101");
    expect(dataRow).toBeDefined();
    expect(dataRow![1]).toBe("Alice Smith");
  });
});
