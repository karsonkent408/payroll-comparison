import { test, expect, describe } from "bun:test";
import { runComparison } from "@/server/api/services/comparisonEngine";
import type { ColumnMapping } from "@/lib/types";

const baseMapping: ColumnMapping = {
  legacy_employee_key: ["emp_id"],
  new_employee_key: ["employee_id"],
  entries: [
    { legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0.01},
  ],
};

describe("runComparison", () => {
  test("employees present in both Sources appear in matched with their EmployeeKey", () => {
    const result = runComparison(
      [{ emp_id: "101", gross: "1000.00" }, { emp_id: "102", gross: "2000.00" }],
      [{ employee_id: "101", gross_pay: "1000.00" }, { employee_id: "102", gross_pay: "2000.00" }],
      baseMapping
    );

    expect(result.matched).toHaveLength(2);
    expect(result.matched.map((r) => r.employee_key)).toContain("101");
    expect(result.matched.map((r) => r.employee_key)).toContain("102");
    expect(result.unmatched).toHaveLength(0);
  });

  test("employee in Legacy but not New → unmatched with source 'legacy'", () => {
    const result = runComparison(
      [{ emp_id: "101", gross: "1000.00" }, { emp_id: "999", gross: "500.00" }],
      [{ employee_id: "101", gross_pay: "1000.00" }],
      baseMapping
    );

    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]).toEqual({ employee_key: "999", source: "legacy" });
    expect(result.matched).toHaveLength(1);
  });

  test("difference within Tolerance → auto_status 'resolved'", () => {
    const result = runComparison(
      [{ emp_id: "101", gross: "1000.00" }],
      [{ employee_id: "101", gross_pay: "1000.005" }], // new higher: difference = -0.005
      baseMapping
    );

    const entryResult = result.matched[0].results[0];
    expect(entryResult.auto_status).toBe("resolved");
    expect(entryResult.difference).toBeCloseTo(-0.005);
  });

  test("difference exceeding Tolerance → auto_status 'unresolved'", () => {
    const result = runComparison(
      [{ emp_id: "101", gross: "1000.00" }],
      [{ employee_id: "101", gross_pay: "1000.02" }], // new higher: difference = -0.02
      baseMapping
    );

    const entryResult = result.matched[0].results[0];
    expect(entryResult.auto_status).toBe("unresolved");
    expect(entryResult.difference).toBeCloseTo(-0.02);
  });

  test("difference is negative when New magnitude is higher than Legacy", () => {
    const result = runComparison(
      [{ emp_id: "101", gross: "800.00" }],
      [{ employee_id: "101", gross_pay: "850.00" }],
      { ...baseMapping, entries: [{ legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 100 }] }
    );

    const entryResult = result.matched[0].results[0];
    expect(entryResult.difference).toBeCloseTo(-50);
    expect(entryResult.auto_status).toBe("resolved");
  });

  test("auto_status is 'resolved' at exactly −tolerance, 0, and +tolerance", () => {
    const tol = 5;
    const toleranceMapping = {
      ...baseMapping,
      entries: [{ legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: tol }],
    };

    // difference = +5 (legacy higher, at +tolerance)
    const atPlusTolerance = runComparison(
      [{ emp_id: "101", gross: "105.00" }],
      [{ employee_id: "101", gross_pay: "100.00" }],
      toleranceMapping
    );
    expect(atPlusTolerance.matched[0].results[0].auto_status).toBe("resolved");

    // difference = 0
    const atZero = runComparison(
      [{ emp_id: "101", gross: "100.00" }],
      [{ employee_id: "101", gross_pay: "100.00" }],
      toleranceMapping
    );
    expect(atZero.matched[0].results[0].auto_status).toBe("resolved");

    // difference = -5 (new higher, at −tolerance)
    const atMinusTolerance = runComparison(
      [{ emp_id: "101", gross: "100.00" }],
      [{ employee_id: "101", gross_pay: "105.00" }],
      toleranceMapping
    );
    expect(atMinusTolerance.matched[0].results[0].auto_status).toBe("resolved");
  });

  test("auto_status is 'unresolved' just outside [−tolerance, +tolerance]", () => {
    const tol = 5;
    const toleranceMapping = {
      ...baseMapping,
      entries: [{ legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: tol }],
    };

    // difference = +5.01 (just above +tolerance)
    const abovePlus = runComparison(
      [{ emp_id: "101", gross: "105.01" }],
      [{ employee_id: "101", gross_pay: "100.00" }],
      toleranceMapping
    );
    expect(abovePlus.matched[0].results[0].auto_status).toBe("unresolved");

    // difference = -5.01 (just below −tolerance)
    const belowMinus = runComparison(
      [{ emp_id: "101", gross: "100.00" }],
      [{ employee_id: "101", gross_pay: "105.01" }],
      toleranceMapping
    );
    expect(belowMinus.matched[0].results[0].auto_status).toBe("unresolved");
  });

  describe("per-column breakdown", () => {
    const multiMapping: ColumnMapping = {
      legacy_employee_key: ["emp_id"],
      new_employee_key: ["employee_id"],
      entries: [
        {
          legacy_columns: ["regular", "overtime"],
          new_columns: ["gross_pay"],
          tolerance: 0.01,
        },
      ],
    };

    test("multi-column legacy side produces legacy_breakdown with per-column values", () => {
      const result = runComparison(
        [{ emp_id: "101", regular: "800.00", overtime: "200.00" }],
        [{ employee_id: "101", gross_pay: "1000.00" }],
        multiMapping
      );

      const entryResult = result.matched[0].results[0];
      expect(entryResult.legacy_breakdown).toEqual({ regular: 800, overtime: 200 });
    });

    test("single-column new side produces null new_breakdown", () => {
      const result = runComparison(
        [{ emp_id: "101", regular: "800.00", overtime: "200.00" }],
        [{ employee_id: "101", gross_pay: "1000.00" }],
        multiMapping
      );

      const entryResult = result.matched[0].results[0];
      expect(entryResult.new_breakdown).toBeNull();
    });

    test("breakdown values sum to legacy_value", () => {
      const result = runComparison(
        [{ emp_id: "101", regular: "800.00", overtime: "200.00" }],
        [{ employee_id: "101", gross_pay: "1000.00" }],
        multiMapping
      );

      const entryResult = result.matched[0].results[0];
      const sum = Object.values(entryResult.legacy_breakdown!).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(entryResult.legacy_value);
    });

    test("single-column legacy side produces null legacy_breakdown", () => {
      const result = runComparison(
        [{ emp_id: "101", gross: "1000.00" }],
        [{ employee_id: "101", gross_pay: "1000.00" }],
        baseMapping
      );

      const entryResult = result.matched[0].results[0];
      expect(entryResult.legacy_breakdown).toBeNull();
    });

    test("multi-column new side produces new_breakdown with per-column values", () => {
      const bothMultiMapping: ColumnMapping = {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        entries: [
          {
            legacy_columns: ["gross"],
            new_columns: ["base_pay", "bonus"],
            tolerance: 0.01,
          },
        ],
      };

      const result = runComparison(
        [{ emp_id: "101", gross: "1000.00" }],
        [{ employee_id: "101", base_pay: "900.00", bonus: "100.00" }],
        bothMultiMapping
      );

      const entryResult = result.matched[0].results[0];
      expect(entryResult.new_breakdown).toEqual({ base_pay: 900, bonus: 100 });
      expect(entryResult.legacy_breakdown).toBeNull();
    });
  });

  test("multi-column MappingEntry — both sides summed before comparison", () => {
    const multiMapping: ColumnMapping = {
      legacy_employee_key: ["emp_id"],
      new_employee_key: ["employee_id"],
      entries: [
        {
          legacy_columns: ["regular", "overtime"],
          new_columns: ["gross_pay"],
          tolerance: 0.01,
        },
      ],
    };

    const result = runComparison(
      [{ emp_id: "101", regular: "800.00", overtime: "200.00" }], // sum = 1000.00
      [{ employee_id: "101", gross_pay: "1000.00" }],
      multiMapping
    );

    const entryResult = result.matched[0].results[0];
    expect(entryResult.legacy_value).toBeCloseTo(1000.0);
    expect(entryResult.new_value).toBeCloseTo(1000.0);
    expect(entryResult.auto_status).toBe("resolved");
  });

  test("absent New column treated as 0 — difference equals full Legacy value, auto_status unresolved", () => {
    const absentNewMapping: ColumnMapping = {
      legacy_employee_key: ["emp_id"],
      new_employee_key: ["employee_id"],
      entries: [{ legacy_columns: ["pto"], new_columns: ["pto_pay"], tolerance: 0.01 }],
    };

    const result = runComparison(
      [{ emp_id: "101", pto: "240.00" }],
      [{ employee_id: "101" }], // pto_pay column absent entirely
      absentNewMapping
    );

    const entryResult = result.matched[0].results[0];
    expect(entryResult.new_value).toBe(0);
    expect(entryResult.difference).toBeCloseTo(240.0);
    expect(entryResult.auto_status).toBe("unresolved");
  });

  test("empty or missing cell value is treated as 0", () => {
    const result = runComparison(
      [{ emp_id: "101", gross: "" }],           // empty → 0
      [{ employee_id: "101", gross_pay: "0" }], // explicit 0
      baseMapping
    );

    const entryResult = result.matched[0].results[0];
    expect(entryResult.legacy_value).toBe(0);
    expect(entryResult.new_value).toBe(0);
    expect(entryResult.auto_status).toBe("resolved");
  });

  test("negative inputs → legacy_value and new_value stored as absolute magnitudes", () => {
    const result = runComparison(
      [{ emp_id: "101", gross: "-500.00" }],
      [{ employee_id: "101", gross_pay: "-499.99" }],
      baseMapping
    );

    const entryResult = result.matched[0].results[0];
    expect(entryResult.legacy_value).toBeCloseTo(500.0);
    expect(entryResult.new_value).toBeCloseTo(499.99);
    expect(entryResult.difference).toBeCloseTo(0.01); // legacy magnitude higher
    expect(entryResult.auto_status).toBe("resolved");
  });

  test("produces identical output for identical inputs (deterministic)", () => {
    const legacy = [{ emp_id: "101", gross: "1000.00" }, { emp_id: "102", gross: "2000.00" }];
    const newRows = [{ employee_id: "101", gross_pay: "1000.00" }, { employee_id: "102", gross_pay: "2000.05" }];

    const first = runComparison(legacy, newRows, baseMapping);
    const second = runComparison(legacy, newRows, baseMapping);

    expect(first).toEqual(second);
  });

  test("difference exactly equal to Tolerance → auto_status 'resolved'", () => {
    const result = runComparison(
      [{ emp_id: "101", gross: "1000.00" }],
      [{ employee_id: "101", gross_pay: "1000.01" }], // diff = 0.01, tolerance = 0.01
      baseMapping
    );

    expect(result.matched[0].results[0].auto_status).toBe("resolved");
  });

  describe("approved fuzzy pairs", () => {
    const fuzzyLegacy = [{ emp_id: "J Smith", gross: "1000.00" }];
    const fuzzyNew  = [{ employee_id: "John Smith", gross_pay: "1000.00" }];

    test("approved fuzzy pair produces a matched row with the legacy key", () => {
      const pairs = new Map([["J Smith", "John Smith"]]);
      const result = runComparison(fuzzyLegacy, fuzzyNew, baseMapping, pairs);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].employee_key).toBe("J Smith");
      expect(result.unmatched).toHaveLength(0);
    });

    test("employee with no exact match and no approved fuzzy pair remains unmatched", () => {
      const result = runComparison(fuzzyLegacy, fuzzyNew, baseMapping);

      expect(result.matched).toHaveLength(0);
      expect(result.unmatched.some((u) => u.employee_key === "J Smith" && u.source === "legacy")).toBe(true);
    });

    test("fuzzy pair where legacy key is not in source rows is skipped", () => {
      const pairs = new Map([["Ghost", "John Smith"]]);
      const result = runComparison(fuzzyLegacy, fuzzyNew, baseMapping, pairs);

      // "Ghost" has no row — pair skipped; "J Smith" still unmatched
      expect(result.matched).toHaveLength(0);
      expect(result.unmatched.some((u) => u.employee_key === "J Smith")).toBe(true);
      expect(result.unmatched.every((u) => u.employee_key !== "Ghost")).toBe(true);
    });

    test("fuzzy pair where new key is not in source rows is skipped", () => {
      const pairs = new Map([["J Smith", "Ghost"]]);
      const result = runComparison(fuzzyLegacy, fuzzyNew, baseMapping, pairs);

      expect(result.matched).toHaveLength(0);
      expect(result.unmatched.some((u) => u.employee_key === "J Smith")).toBe(true);
    });
  });

  describe("key normalization", () => {
    test("leading zeros on the New side are stripped before matching", () => {
      const result = runComparison(
        [{ emp_id: "897", gross: "1120.00" }],
        [{ employee_id: "0897", gross_pay: "1120.00" }],
        baseMapping
      );
      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });

    test("leading zeros on the Legacy side are stripped before matching", () => {
      const result = runComparison(
        [{ emp_id: "0682", gross: "4600.00" }],
        [{ employee_id: "682", gross_pay: "4600.00" }],
        baseMapping
      );
      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });

    test("multiple leading zeros on both sides are stripped before matching", () => {
      const result = runComparison(
        [{ emp_id: "00101", gross: "500.00" }],
        [{ employee_id: "0101", gross_pay: "500.00" }],
        baseMapping
      );
      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });

    test("trailing and leading whitespace on one side is ignored", () => {
      const result = runComparison(
        [{ emp_id: " 101 ", gross: "500.00" }],
        [{ employee_id: "101", gross_pay: "500.00" }],
        baseMapping
      );
      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });

    test("whitespace on both sides is ignored", () => {
      const result = runComparison(
        [{ emp_id: "  101  ", gross: "500.00" }],
        [{ employee_id: " 101", gross_pay: "500.00" }],
        baseMapping
      );
      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });

    test("capitalization difference is ignored for alphanumeric keys", () => {
      const result = runComparison(
        [{ emp_id: "EMP101", gross: "500.00" }],
        [{ employee_id: "emp101", gross_pay: "500.00" }],
        baseMapping
      );
      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });

    test("uppercase on both sides is normalized before matching", () => {
      const result = runComparison(
        [{ emp_id: "ABC-99", gross: "800.00" }],
        [{ employee_id: "abc-99", gross_pay: "800.00" }],
        baseMapping
      );
      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });

    test("combined whitespace and leading zeros are both handled", () => {
      const result = runComparison(
        [{ emp_id: " 0042 ", gross: "200.00" }],
        [{ employee_id: "42", gross_pay: "200.00" }],
        baseMapping
      );
      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });
  });

  test("employee in New but not Legacy → unmatched with source 'new'", () => {
    const result = runComparison(
      [{ emp_id: "101", gross: "1000.00" }],
      [{ employee_id: "101", gross_pay: "1000.00" }, { employee_id: "888", gross_pay: "750.00" }],
      baseMapping
    );

    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]).toEqual({ employee_key: "888", source: "new" });
    expect(result.matched).toHaveLength(1);
  });

  test("composite new key ['First Name','Last Name'] pairs against legacy full-name key", () => {
    const compositeMapping: ColumnMapping = {
      legacy_employee_key: ["full_name"],
      new_employee_key: ["First Name", "Last Name"],
      entries: [{ legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0.01 }],
    };

    const result = runComparison(
      [{ full_name: "John Smith", gross: "1000.00" }],
      [{ "First Name": "John", "Last Name": "Smith", gross_pay: "1000.00" }],
      compositeMapping
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].employee_key).toBe("John Smith");
    expect(result.unmatched).toHaveLength(0);
  });

  test("composite new key: unmatched employee_key is the joined composite value", () => {
    const compositeMapping: ColumnMapping = {
      legacy_employee_key: ["full_name"],
      new_employee_key: ["First Name", "Last Name"],
      entries: [{ legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0.01 }],
    };

    const result = runComparison(
      [{ full_name: "Alice Jones", gross: "500.00" }],
      [{ "First Name": "John", "Last Name": "Smith", gross_pay: "1000.00" }],
      compositeMapping
    );

    expect(result.unmatched).toHaveLength(2);
    const newUnmatched = result.unmatched.find((u) => u.source === "new");
    expect(newUnmatched?.employee_key).toBe("John Smith");
  });
});
