import { test, expect, describe } from "bun:test";
import { applyColumnSuggestion } from "../applyColumnSuggestion";
import type { ColumnSuggestion, ComparisonCategory } from "@/lib/types";

type EntryDraft = {
  id: string;
  legacy_columns: string[];
  new_columns: string[];
  category: ComparisonCategory;
  tolerance: string;
  label: string;
  labelEdited: boolean;
};

function makeEntry(id: string, new_columns: string[], legacy_columns: string[] = []): EntryDraft {
  return { id, legacy_columns, new_columns, category: "Earnings", tolerance: "0.01", label: "", labelEdited: false };
}

const SUGGESTION: ColumnSuggestion = {
  mappings: [
    { new_columns: ["Earnings Regular"], legacy_column: "reg_pay", category: "Earnings", label: "Regular Earnings" },
    { new_columns: ["Earnings Overtime"], legacy_column: "ot_pay", category: "Earnings", label: "Overtime Earnings" },
  ],
  unmatched_legacy: ["misc"],
};

describe("applyColumnSuggestion", () => {
  test("fills in legacy_columns for entries whose new_columns match a suggestion and are currently empty", () => {
    const entries = [
      makeEntry("a", ["Earnings Regular"]),
      makeEntry("b", ["Earnings Overtime"]),
    ];

    const { entries: result } = applyColumnSuggestion(entries, SUGGESTION);

    expect(result[0].legacy_columns).toEqual(["reg_pay"]);
    expect(result[1].legacy_columns).toEqual(["ot_pay"]);
  });

  test("does not overwrite entries that already have legacy_columns set", () => {
    const entries = [
      makeEntry("a", ["Earnings Regular"], ["existing_col"]),
      makeEntry("b", ["Earnings Overtime"]),
    ];

    const { entries: result } = applyColumnSuggestion(entries, SUGGESTION);

    expect(result[0].legacy_columns).toEqual(["existing_col"]);
    expect(result[1].legacy_columns).toEqual(["ot_pay"]);
  });

  test("creates new entries for suggested new_columns not in the existing entries", () => {
    const entries = [makeEntry("a", ["Earnings Regular"])];

    const { entries: result } = applyColumnSuggestion(entries, SUGGESTION);

    expect(result).toHaveLength(2);
    const newEntry = result.find((e) => e.new_columns[0] === "Earnings Overtime");
    expect(newEntry).toBeDefined();
    expect(newEntry?.legacy_columns).toEqual(["ot_pay"]);
    expect(newEntry?.category).toBe("Earnings");
    expect(newEntry?.label).toBe("Overtime Earnings");
  });

  describe("absent-column protection", () => {
    const legacyHeaders = ["emp_id", "gross", "net"];
    const newHeaders = ["employee_id", "gross_pay", "net_pay"];

    test("skips entry whose new column is absent from newHeaders", () => {
      const entries = [makeEntry("a", ["pto_pay"])]; // "pto_pay" not in newHeaders

      const { entries: result } = applyColumnSuggestion(
        entries,
        { mappings: [{ new_columns: ["pto_pay"], legacy_column: "pto", category: "Earnings", label: "PTO" }], unmatched_legacy: [] },
        legacyHeaders,
        newHeaders
      );

      expect(result[0].legacy_columns).toEqual([]);
    });

    test("skips entry whose legacy column is absent from legacyHeaders", () => {
      const entries = [makeEntry("a", ["gross_pay"], ["pto"])]; // "pto" not in legacyHeaders

      const { entries: result } = applyColumnSuggestion(
        entries,
        { mappings: [{ new_columns: ["gross_pay"], legacy_column: "gross", category: "Earnings", label: "Gross" }], unmatched_legacy: [] },
        legacyHeaders,
        newHeaders
      );

      expect(result[0].legacy_columns).toEqual(["pto"]);
      expect(result).toHaveLength(1); // no duplicate entry for gross_pay
    });

    test("still fills entries whose columns are fully present in headers", () => {
      const entries = [makeEntry("a", ["gross_pay"])]; // "gross_pay" is in newHeaders

      const { entries: result } = applyColumnSuggestion(
        entries,
        { mappings: [{ new_columns: ["gross_pay"], legacy_column: "gross", category: "Earnings", label: "Gross" }], unmatched_legacy: [] },
        legacyHeaders,
        newHeaders
      );

      expect(result[0].legacy_columns).toEqual(["gross"]);
    });
  });

  test("does not duplicate a new column when AI suggestion is a subset of an existing entry", () => {
    // Existing entry has ["Col A", "Col B"]; AI returns suggestion for ["Col A"] alone.
    // The keys don't match so the suggestion would fall through to the new-entry path —
    // this test guards against that creating a duplicate entry for "Col A".
    const entries = [makeEntry("a", ["Col A", "Col B"])];
    const suggestion: ColumnSuggestion = {
      mappings: [{ new_columns: ["Col A"], legacy_column: "col_a", category: "Earnings", label: "Col A" }],
      unmatched_legacy: [],
    };

    const { entries: result } = applyColumnSuggestion(entries, suggestion);

    expect(result).toHaveLength(1);
    const allNew = result.flatMap((e) => e.new_columns);
    expect(allNew.filter((c) => c === "Col A")).toHaveLength(1);
  });

  test("does not duplicate a new column when two AI suggestions both reference the same column", () => {
    // AI returns two unmatched suggestions that both include "Col A" — the second
    // should not create a duplicate entry for it.
    const entries: EntryDraft[] = [];
    const suggestion: ColumnSuggestion = {
      mappings: [
        { new_columns: ["Col A"], legacy_column: "col_a", category: "Earnings", label: "Col A" },
        { new_columns: ["Col A", "Col B"], legacy_column: "col_ab", category: "Earnings", label: "Col AB" },
      ],
      unmatched_legacy: [],
    };

    const { entries: result } = applyColumnSuggestion(entries, suggestion);

    const allNew = result.flatMap((e) => e.new_columns);
    expect(allNew.filter((c) => c === "Col A")).toHaveLength(1);
  });

  test("does not duplicate a new column when AI hallucination names a column already in use", () => {
    const entries = [makeEntry("a", ["Earnings Regular"], ["reg_pay"])];
    const suggestion: ColumnSuggestion = {
      mappings: [{ new_columns: ["Earnings Regular"], legacy_column: "reg_pay2", category: "Earnings", label: "Regular" }],
      unmatched_legacy: [],
    };

    const { entries: result } = applyColumnSuggestion(entries, suggestion);

    expect(result).toHaveLength(1);
    expect(result.flatMap((e) => e.new_columns).filter((c) => c === "Earnings Regular")).toHaveLength(1);
  });

  test("does not create a new entry when suggested legacy_column is empty", () => {
    const entries: EntryDraft[] = [];
    const suggestion: ColumnSuggestion = {
      mappings: [
        { new_columns: ["Earnings Regular"], legacy_column: "", category: "Earnings", label: "Regular Earnings" },
      ],
      unmatched_legacy: [],
    };

    const { entries: result } = applyColumnSuggestion(entries, suggestion);

    // Entry is created but has no legacy_columns
    expect(result).toHaveLength(1);
    expect(result[0].legacy_columns).toEqual([]);
  });
});
