import { test, expect, describe } from "bun:test";
import * as xlsx from "xlsx";
import { comparisonExportDynamic } from "@/server/api/services/comparisonExportDynamic";
import type { StoredResults } from "@/server/db/repos/results";
import type { StoredColumnMapping, Source } from "@/lib/types";

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
          new_value: 950,
          new_breakdown: null,
          difference: 50,
          tolerance: 0.01,
          auto_status: "unresolved",
          manual_override: "resolved",
          note: "rounding",
        },
      ],
    },
  ],
  unmatched: [],
};

const baseComparison = { label: "Jan 2024", pay_period_start: "2024-01-01", pay_period_end: "2024-01-31" }

const baseNewSource: Source = {
  id: 1,
  comparison_id: 1,
  type: "new",
  file_name: "new.csv",
  uploaded_at: "2024-01-01",
  headers: ["employee_id", "gross_pay"],
  rows: [{ employee_id: "101", gross_pay: "950" }],
  row_count: 1,
  detectedTypes: { employee_id: "string", gross_pay: "number" },
  columnSections: {},
  legacy_provider: null,
  format_notes: null,
}

const basePairings = [{ legacy_key: "101", new_key: "101" }];

const noOverrideResults: StoredResults = {
  matched: [
    {
      employee_key: "101",
      employee_name: "Alice Smith",
      results: [
        {
          ...baseResults.matched[0].results[0],
          manual_override: null,
          auto_status: "unresolved",
        },
      ],
    },
  ],
  unmatched: [],
};

describe("comparisonExportDynamic", () => {
  test("returns an ArrayBuffer", () => {
    const result = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  test("workbook contains exactly three sheets named Legacy, New, Summary", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Legacy", "New", "Summary"]);
  });

  test("New sheet header row matches Source.headers exactly", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json<any[]>(wb.Sheets["New"], { header: 1 });
    const header = rows[0];
    expect(header[0]).toBe("employee_id");
    expect(header[1]).toBe("gross_pay");
  });

  test("New sheet data rows contain Source.rows values", () => {
    const source: Source = {
      ...baseNewSource,
      headers: ["employee_id", "gross_pay", "tax"],
      rows: [
        { employee_id: "101", gross_pay: "950", tax: "75" },
        { employee_id: "202", gross_pay: "1200", tax: "100" },
      ],
    };
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, source, basePairings);
    const wb = xlsx.read(buf, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json<any[]>(wb.Sheets["New"], { header: 1 });
    expect(rows[1][0]).toBe("101");
    expect(rows[1][1]).toBe("950");
    expect(rows[1][2]).toBe("75");
    expect(rows[2][0]).toBe("202");
  });

  test("New sheet last column header is __key__", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json<any[]>(wb.Sheets["New"], { header: 1 });
    const header = rows[0];
    expect(header[header.length - 1]).toBe("__key__");
  });

  test("Legacy sheet: first column is Employee ID, remaining columns are MappingEntry labels; matched employees only", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json<any[]>(wb.Sheets["Legacy"], { header: 1 });
    const header = rows[0];
    expect(header[0]).toBe("Employee ID");
    expect(header[1]).toBe("Gross");
    // Only matched employees — no unmatched rows
    expect(rows).toHaveLength(2); // 1 header + 1 matched employee
    expect(rows[1][0]).toBe("101");
  });

  test("Summary data row col A holds the legacy key and col B holds the new key", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer" });
    const ws = wb.Sheets["Summary"];
    // Row 2 = first data row (rows 0-1 are headers)
    const legacyKeyCell = ws[xlsx.utils.encode_cell({ r: 2, c: 0 })];
    const newKeyCell = ws[xlsx.utils.encode_cell({ r: 2, c: 1 })];
    expect(legacyKeyCell?.v).toBe("101");
    expect(newKeyCell?.v).toBe("101");
  });

  test("Summary __new_key__ col uses the new key from pairings even when it differs from the legacy key", () => {
    const fuzzyPairings = [{ legacy_key: "101", new_key: "EMP-101" }];
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, fuzzyPairings);
    const wb = xlsx.read(buf, { type: "buffer" });
    const ws = wb.Sheets["Summary"];
    const legacyKeyCell = ws[xlsx.utils.encode_cell({ r: 2, c: 0 })];
    const newKeyCell = ws[xlsx.utils.encode_cell({ r: 2, c: 1 })];
    expect(legacyKeyCell?.v).toBe("101");
    expect(newKeyCell?.v).toBe("EMP-101");
  });

  test("Summary column A header is __legacy_key__ and column B header is __new_key__", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer" });
    const ws = wb.Sheets["Summary"];
    // Row 1 = entry label row (row 0 = category header)
    const colA = ws[xlsx.utils.encode_cell({ r: 1, c: 0 })];
    const colB = ws[xlsx.utils.encode_cell({ r: 1, c: 1 })];
    expect(colA?.v).toBe("__legacy_key__");
    expect(colB?.v).toBe("__new_key__");
  });

  test("Summary Legacy formula uses XLOOKUP and references the ColumnEntry label by name", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    const legacyCell = ws[xlsx.utils.encode_cell({ r: 2, c: 4 })];
    expect(legacyCell?.f).toContain("XLOOKUP");
    expect(legacyCell?.f).toContain("Legacy!");
    expect(legacyCell?.f).toContain('"Gross"');
    // Must not use bare positional column references like B2
    expect(legacyCell?.f).not.toMatch(/Legacy![A-Z]+\d+/);
  });

  // Note: xlsx 0.18.x does not support writing freeze panes to OOXML output.
  // The frozen pane (4 columns) is enforced via the Google Sheets export — see sheetsExportDynamic tests.

  test("multi-column ColumnEntry New formula contains one XLOOKUP term per raw New column summed with +", () => {
    const multiColMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [{
        ...baseMapping.entries[0],
        new_columns: ["regular_pay", "overtime_pay"],
      }],
    };
    const buf = comparisonExportDynamic(baseResults, multiColMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    const newCell = ws[xlsx.utils.encode_cell({ r: 2, c: 5 })];
    expect(newCell?.f).toContain('"regular_pay"');
    expect(newCell?.f).toContain('"overtime_pay"');
    expect(newCell?.f).toContain("+");
    // Two XLOOKUP invocations
    expect(String(newCell?.f ?? "").split("XLOOKUP").length - 1).toBeGreaterThanOrEqual(2);
  });

  test("Summary New formula uses XLOOKUP with __key__ and references the raw New column name", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    const newCell = ws[xlsx.utils.encode_cell({ r: 2, c: 5 })];
    expect(newCell?.f).toContain("XLOOKUP");
    expect(newCell?.f).toContain("New!");
    expect(newCell?.f).toContain('"__key__"');
    expect(newCell?.f).toContain('"gross_pay"');
    expect(newCell?.f).not.toMatch(/New![A-Z]+\d+/);
  });

  test("Summary Legacy cells reference the Legacy sheet with a cross-sheet formula", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    // Col 4 = first entry Legacy (shifted +2 from old col 2)
    const legacyCell = ws[xlsx.utils.encode_cell({ r: 2, c: 4 })];
    expect(legacyCell?.f).toBeDefined();
  });

  test("UnmatchedEmployees appear in Summary only — Legacy and New sheets contain matched employees only", () => {
    const results: StoredResults = {
      matched: [{ employee_key: "101", employee_name: "Alice Smith", results: [{ ...baseResults.matched[0].results[0] }] }],
      unmatched: [{ id: "1", employee_key: "999", employee_name: null, source_type: "legacy", resolved: false, note: null }],
    };
    const buf = comparisonExportDynamic(results, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer" });

    // Legacy and New: only the matched employee
    const legacyRows = xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets["Legacy"], { header: 1 }) as unknown[][];
    const newRows = xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets["New"], { header: 1 }) as unknown[][];
    expect(legacyRows).toHaveLength(2); // header + 1 matched
    expect(newRows).toHaveLength(2);

    // Summary: matched employee row + unmatched row appended below
    const summaryRows = xlsx.utils.sheet_to_json<any[]>(wb.Sheets["Summary"], { header: 1, defval: null });
    // row 0=category header, row 1=entry labels, row 2=matched employee, row 3=unmatched
    expect(summaryRows).toHaveLength(4);
    // col 2 = visible Employee ID (cols 0 and 1 are hidden __legacy_key__ / __new_key__)
    expect(summaryRows[3][2]).toBe("999");
  });

  test("Summary DiscrepancyStatus and Notes cells are static strings — manual_override takes precedence over auto_status", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    // Col 7=Status, col 8=Notes (shifted +2); baseResults has manual_override='resolved', note='rounding'
    const statusCell = ws[xlsx.utils.encode_cell({ r: 2, c: 7 })];
    const notesCell = ws[xlsx.utils.encode_cell({ r: 2, c: 8 })];
    expect(statusCell?.f).toBeUndefined();
    expect(statusCell?.v).toBe("resolved");
    expect(notesCell?.f).toBeUndefined();
    expect(notesCell?.v).toBe("rounding");
  });

  test("Status cell for matched row with no manual override is a formula", () => {
    const buf = comparisonExportDynamic(noOverrideResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    // Col 7 = Status for first entry (col 4=Legacy, 5=New, 6=Diff, 7=Status, shifted +2)
    const statusCell = ws[xlsx.utils.encode_cell({ r: 2, c: 7 })];
    expect(statusCell?.f).toBeDefined();
  });

  test("Status formula references the intra-Summary Difference cell — no cross-sheet reference", () => {
    const buf = comparisonExportDynamic(noOverrideResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    const statusCell = ws[xlsx.utils.encode_cell({ r: 2, c: 7 })];
    // Difference col for first entry is col 6 = "G"; first data row in Summary is Excel row 3
    expect(statusCell?.f).toMatch(/G3/);
    expect(statusCell?.f).not.toMatch(/Legacy!/);
    expect(statusCell?.f).not.toMatch(/New!/);
  });

  test("Status formula hardcodes the entry Tolerance as a numeric literal", () => {
    const buf = comparisonExportDynamic(noOverrideResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    const statusCell = ws[xlsx.utils.encode_cell({ r: 2, c: 7 })];
    // baseMapping entry has tolerance 0.01
    expect(statusCell?.f).toContain("0.01");
  });

  test("Multiple entries with different Tolerance values produce different hardcoded Tolerance literals in their Status formulas", () => {
    const twoEntryMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], id: "1", tolerance: 0.01, label: "Gross" },
        { ...baseMapping.entries[0], id: "2", tolerance: 5, label: "Tax", new_columns: ["tax"], legacy_columns: ["tax_legacy"] },
      ],
    };
    const twoEntryResults: StoredResults = {
      matched: [{
        employee_key: "101",
        employee_name: "Alice Smith",
        results: [
          { ...baseResults.matched[0].results[0], column_entry_id: "1", manual_override: null },
          { ...baseResults.matched[0].results[0], id: 2, column_entry_id: "2", tolerance: 5, manual_override: null, new_columns: ["tax"], legacy_columns: ["tax_legacy"] },
        ],
      }],
      unmatched: [],
    };
    const buf = comparisonExportDynamic(twoEntryResults, twoEntryMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    // Entry 0: Status at col 7; Entry 1: Status at col 12 (shifted +2)
    const status1 = ws[xlsx.utils.encode_cell({ r: 2, c: 7 })];
    const status2 = ws[xlsx.utils.encode_cell({ r: 2, c: 12 })];
    expect(status1?.f).toContain("0.01");
    expect(status2?.f).toContain("5");
    expect(status1?.f).not.toEqual(status2?.f);
  });

  test("Summary Difference cell is a formula referencing adjacent Legacy and New cells in the Summary", () => {
    const buf = comparisonExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings);
    const wb = xlsx.read(buf, { type: "buffer", cellFormula: true });
    const ws = wb.Sheets["Summary"];
    // Col 6 = Difference (col 4=Legacy, col 5=New, col 6=Diff, shifted +2)
    const diffCell = ws[xlsx.utils.encode_cell({ r: 2, c: 6 })];
    // Formula should reference E3 and F3 (the adjacent Legacy and New cells in Summary)
    expect(diffCell?.f).toMatch(/E3/);
    expect(diffCell?.f).toMatch(/F3/);
    expect(diffCell?.f).not.toMatch(/Legacy!/);
    expect(diffCell?.f).not.toMatch(/New!/);
  });
});
