import { test, expect, describe } from "bun:test";
import { comparisonExportCsv } from "@/server/api/services/comparisonExportCsv";
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

function parseRows(csv: string): string[][] {
  return csv.trim().split("\n").map((row) =>
    row.split(",").map((cell) => cell.replace(/^"|"$/g, "").replace(/""/g, '"'))
  );
}

describe("comparisonExportCsv", () => {
  test("returns a non-empty string for valid input", () => {
    const result = comparisonExportCsv(baseResults, baseMapping, baseComparison);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("header uses category-prefixed column names", () => {
    const csv = comparisonExportCsv(baseResults, baseMapping, baseComparison);
    const rows = parseRows(csv);
    const header = rows[0];
    expect(header[0]).toBe("Employee ID");
    expect(header[1]).toBe("Employee Name");
    expect(header[2]).toBe("Earnings - Gross Legacy");
    expect(header[3]).toBe("Earnings - Gross New");
    expect(header[4]).toBe("Earnings - Gross Difference");
    expect(header[5]).toBe("Earnings - Gross Status");
    expect(header[6]).toBe("Earnings - Gross Notes");
  });

  test("MappingEntries appear in ComparisonCategory order — Hours before Earnings", () => {
    const mapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { id: "2", mapping_id: 1, legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0.01, category: "Earnings", display_order: 0, label: "Gross" },
        { id: "1", mapping_id: 1, legacy_columns: ["hours"], new_columns: ["hours_paid"], tolerance: 0, category: "Hours", display_order: 0, label: "Hours" },
      ],
    };
    const csv = comparisonExportCsv(baseResults, mapping, baseComparison);
    const header = parseRows(csv)[0];
    const hoursIdx = header.findIndex((h) => h === "Hours - Hours Legacy");
    const earningsIdx = header.findIndex((h) => h === "Earnings - Gross Legacy");
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
    const csv = comparisonExportCsv(baseResults, mapping, baseComparison);
    const header = parseRows(csv)[0];
    const grossIdx = header.findIndex((h) => h === "Earnings - Gross Legacy");
    const bonusIdx = header.findIndex((h) => h === "Earnings - Bonus Legacy");
    expect(grossIdx).toBeLessThan(bonusIdx);
  });

  test("effective DiscrepancyStatus: manual_override takes precedence over auto_status", () => {
    const results: StoredResults = {
      matched: [{
        employee_key: "101",
        employee_name: null,
        results: [{
          ...baseResults.matched[0].results[0],
          auto_status: "unresolved",
          manual_override: "resolved",
        }],
      }],
      unmatched: [],
    };
    const csv = comparisonExportCsv(results, baseMapping, baseComparison);
    const rows = parseRows(csv);
    const dataRow = rows[1];
    expect(dataRow[5]).toBe("resolved"); // Status column
  });

  test("UnmatchedEmployees appear after matched rows with blank MappingEntry columns", () => {
    const results: StoredResults = {
      matched: [{ employee_key: "101", employee_name: "Alice Smith", results: [{ ...baseResults.matched[0].results[0] }] }],
      unmatched: [
        { id: "1", employee_key: "999", employee_name: null, source_type: "legacy", resolved: false, note: null },
      ],
    };
    const csv = comparisonExportCsv(results, baseMapping, baseComparison);
    const rows = parseRows(csv);
    // header + 1 matched + 1 unmatched = 3 rows
    expect(rows).toHaveLength(3);
    const unmatchedRow = rows[2];
    expect(unmatchedRow[0]).toBe("999"); // Employee ID
    expect(unmatchedRow[2]).toBe("");    // Legacy column blank
    expect(unmatchedRow[5]).toBe("");    // Status column blank
  });
});
