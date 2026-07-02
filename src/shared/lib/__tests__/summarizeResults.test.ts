import { test, expect } from "bun:test";
import { summarizeResults } from "../summarizeResults";
import type { StoredResults } from "@/features/comparisons/types";

function makeResult(
  id: number,
  auto_status: "resolved" | "unresolved",
  difference: number,
  manual_override: "resolved" | "unresolved" | null = null,
  label = "Gross Pay",
  category = "Earnings"
) {
  return {
    id,
    column_entry_id: String(id),
    legacy_columns: [],
    new_columns: [],
    category,
    label,
    display_order: 0,
    legacy_value: 0,
    legacy_breakdown: null,
    new_value: 0,
    new_breakdown: null,
    difference,
    tolerance: 0,
    auto_status,
    manual_override,
    note: null,
  };
}

test("counts per-employee totals and resolved rows", () => {
  const results: StoredResults = {
    matched: [
      {
        employee_key: "EMP001",
        employee_name: "Alice",
        results: [
          makeResult(1, "resolved", 0),
          makeResult(2, "unresolved", 10),
          makeResult(3, "resolved", 0),
        ],
      },
    ],
    unmatched: [],
  };

  const { byEmployee } = summarizeResults(results);

  expect(byEmployee.get("EMP001")).toEqual({ name: "Alice", total: 3, resolved: 2 });
});

test("manual_override takes precedence over auto_status", () => {
  const results: StoredResults = {
    matched: [
      {
        employee_key: "EMP002",
        employee_name: "Bob",
        results: [
          makeResult(10, "unresolved", 50, "resolved"),  // override flips to resolved
          makeResult(11, "resolved", 0, "unresolved"),   // override flips to unresolved
        ],
      },
    ],
    unmatched: [],
  };

  const { byEmployee } = summarizeResults(results);

  expect(byEmployee.get("EMP002")).toEqual({ name: "Bob", total: 2, resolved: 1 });
});

test("employee with zero DiscrepancyStatus rows is excluded from byEmployee", () => {
  const results: StoredResults = {
    matched: [
      { employee_key: "EMP003", employee_name: "Carol", results: [] },
    ],
    unmatched: [],
  };

  const { byEmployee } = summarizeResults(results);

  expect(byEmployee.has("EMP003")).toBe(false);
});

test("majorIssues excludes resolved rows", () => {
  const results: StoredResults = {
    matched: [
      {
        employee_key: "EMP004",
        employee_name: "Dave",
        results: [
          makeResult(20, "resolved", 100),
          makeResult(21, "unresolved", 50),
        ],
      },
    ],
    unmatched: [],
  };

  const { majorIssues } = summarizeResults(results);

  expect(majorIssues).toHaveLength(1);
  expect(majorIssues[0].id).toBe(21);
});

test("majorIssues excludes rows resolved via manual_override", () => {
  const results: StoredResults = {
    matched: [
      {
        employee_key: "EMP005",
        employee_name: "Eve",
        results: [
          makeResult(30, "unresolved", 200, "resolved"), // overridden to resolved
          makeResult(31, "unresolved", 75),
        ],
      },
    ],
    unmatched: [],
  };

  const { majorIssues } = summarizeResults(results);

  expect(majorIssues).toHaveLength(1);
  expect(majorIssues[0].id).toBe(31);
});

test("majorIssues is sorted by Math.abs(difference) descending", () => {
  const results: StoredResults = {
    matched: [
      {
        employee_key: "EMP006",
        employee_name: "Frank",
        results: [
          makeResult(40, "unresolved", 10),
          makeResult(41, "unresolved", 300),
          makeResult(42, "unresolved", 50),
        ],
      },
    ],
    unmatched: [],
  };

  const { majorIssues } = summarizeResults(results);

  expect(majorIssues.map((m) => m.id)).toEqual([41, 42, 40]);
});

test("majorIssues returns at most 5 entries", () => {
  const results: StoredResults = {
    matched: [
      {
        employee_key: "EMP007",
        employee_name: "Grace",
        results: [
          makeResult(50, "unresolved", 10),
          makeResult(51, "unresolved", 20),
          makeResult(52, "unresolved", 30),
          makeResult(53, "unresolved", 40),
          makeResult(54, "unresolved", 50),
          makeResult(55, "unresolved", 60),
        ],
      },
    ],
    unmatched: [],
  };

  const { majorIssues } = summarizeResults(results);

  expect(majorIssues).toHaveLength(5);
  expect(majorIssues[0].id).toBe(55); // highest difference first
});

test("majorIssues carries expected fields", () => {
  const results: StoredResults = {
    matched: [
      {
        employee_key: "EMP008",
        employee_name: "Hank",
        results: [makeResult(60, "unresolved", 123, null, "Overtime", "Hours")],
      },
    ],
    unmatched: [],
  };

  const { majorIssues } = summarizeResults(results);

  expect(majorIssues[0]).toEqual({
    id: 60,
    employee_key: "EMP008",
    employee_name: "Hank",
    label: "Overtime",
    category: "Hours",
    difference: 123,
  });
});
