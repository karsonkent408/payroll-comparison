import { test, expect, describe } from "bun:test";
import { sortMatchedRows } from "../../sortMatchedRows";
import type { StoredMatchedRow } from "../../types";

function makeRow(overrides: Partial<StoredMatchedRow> & { employee_key: string }): StoredMatchedRow {
  return {
    employee_name: null,
    employee_first_name: null,
    employee_last_name: null,
    results: [],
    ...overrides,
  };
}

function makeRowWithDiff(key: string, ...diffs: number[]): StoredMatchedRow {
  return makeRow({
    employee_key: key,
    results: diffs.map((difference) => ({
      id: 0,
      column_entry_id: "0",
      legacy_columns: [],
      new_columns: [],
      category: "Earnings",
      label: "Gross",
      display_order: 0,
      legacy_value: 0,
      legacy_breakdown: null,
      new_value: 0,
      new_breakdown: null,
      difference,
      tolerance: 0,
      auto_status: "unresolved",
      manual_override: null,
      note: null,
    })),
  });
}

describe("sortMatchedRows — first_name", () => {
  test("sorts ascending case-insensitive, nulls last", () => {
    const rows = [
      makeRow({ employee_key: "1", employee_first_name: "charlie" }),
      makeRow({ employee_key: "2", employee_first_name: null }),
      makeRow({ employee_key: "3", employee_first_name: "Alice" }),
      makeRow({ employee_key: "4", employee_first_name: "Bob" }),
    ];
    const sorted = sortMatchedRows(rows, "first_name");
    expect(sorted.map((r) => r.employee_key)).toEqual(["3", "4", "1", "2"]);
  });
});

describe("sortMatchedRows — last_name", () => {
  test("sorts ascending case-insensitive, nulls last", () => {
    const rows = [
      makeRow({ employee_key: "1", employee_last_name: "zebra" }),
      makeRow({ employee_key: "2", employee_last_name: null }),
      makeRow({ employee_key: "3", employee_last_name: "Apple" }),
    ];
    const sorted = sortMatchedRows(rows, "last_name");
    expect(sorted.map((r) => r.employee_key)).toEqual(["3", "1", "2"]);
  });
});

describe("sortMatchedRows — employee_key", () => {
  test("sorts lexicographically ascending", () => {
    const rows = [
      makeRow({ employee_key: "EMP-30" }),
      makeRow({ employee_key: "EMP-100" }),
      makeRow({ employee_key: "EMP-5" }),
    ];
    const sorted = sortMatchedRows(rows, "employee_key");
    expect(sorted.map((r) => r.employee_key)).toEqual(["EMP-100", "EMP-30", "EMP-5"]);
  });
});

describe("sortMatchedRows — discrepancy_amount", () => {
  test("places employee with highest total absolute difference first", () => {
    const rows = [
      makeRowWithDiff("A", 10, -5),   // total: 15
      makeRowWithDiff("B", 100),       // total: 100
      makeRowWithDiff("C", 20, 20),    // total: 40
    ];
    const sorted = sortMatchedRows(rows, "discrepancy_amount");
    expect(sorted.map((r) => r.employee_key)).toEqual(["B", "C", "A"]);
  });
});
