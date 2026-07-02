import { test, expect, describe } from "bun:test";
import { runComparisonForEmployee } from "@/server/api/services/comparisonEngine";
import type { ColumnMapping } from "@/lib/types";

const baseMapping: ColumnMapping = {
  legacy_employee_key: ["emp_id"],
  new_employee_key: ["employee_id"],
  entries: [
    { legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0.01 },
  ],
};

describe("runComparisonForEmployee", () => {
  test("returns correct legacy_value, new_value, difference, and auto_status for a matched employee", () => {
    const results = runComparisonForEmployee(
      { emp_id: "101", gross: "1500.00" },
      { employee_id: "101", gross_pay: "1500.00" },
      baseMapping
    );

    expect(results).toHaveLength(1);
    expect(results[0].legacy_value).toBe(1500);
    expect(results[0].new_value).toBe(1500);
    expect(results[0].difference).toBe(0);
    expect(results[0].auto_status).toBe("resolved");
  });

  test("difference outside Tolerance → auto_status 'unresolved'", () => {
    const results = runComparisonForEmployee(
      { emp_id: "101", gross: "1500.00" },
      { employee_id: "101", gross_pay: "1400.00" },
      baseMapping
    );

    expect(results[0].difference).toBeCloseTo(100);
    expect(results[0].auto_status).toBe("unresolved");
  });

  test("multi-column MappingEntry: both legacy columns are summed", () => {
    const mapping: ColumnMapping = {
      legacy_employee_key: ["emp_id"],
      new_employee_key: ["employee_id"],
      entries: [
        { legacy_columns: ["regular", "overtime"], new_columns: ["gross_pay"], tolerance: 0.01 },
      ],
    };

    const results = runComparisonForEmployee(
      { emp_id: "101", regular: "1000.00", overtime: "250.00" },
      { employee_id: "101", gross_pay: "1250.00" },
      mapping
    );

    expect(results[0].legacy_value).toBe(1250);
    expect(results[0].new_value).toBe(1250);
    expect(results[0].auto_status).toBe("resolved");
  });
});
