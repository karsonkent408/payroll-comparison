import { test, expect, describe } from "bun:test";
import { detectLegacyEmployeeKey } from "../employeeKeyDetector";

describe("detectLegacyEmployeeKey", () => {
  test("returns empty string when no column matches", () => {
    expect(detectLegacyEmployeeKey(["Name", "Department", "Gross", "Net"])).toBe("");
    expect(detectLegacyEmployeeKey([])).toBe("");
  });

  test("returns first fuzzy match in column order when multiple candidates exist", () => {
    expect(detectLegacyEmployeeKey(["Emp ID", "Employee Number", "Gross"])).toBe("Emp ID");
  });

  test("exact match wins over fuzzy match regardless of column order", () => {
    expect(detectLegacyEmployeeKey(["Emp ID", "Employee ID", "Gross"])).toBe("Employee ID");
    expect(detectLegacyEmployeeKey(["Employee ID", "Emp Number", "Gross"])).toBe("Employee ID");
  });

  test("returns fuzzy match when no exact match exists", () => {
    expect(detectLegacyEmployeeKey(["Name", "Emp ID", "Gross"])).toBe("Emp ID");
    expect(detectLegacyEmployeeKey(["Name", "Employee Number", "Gross"])).toBe("Employee Number");
    expect(detectLegacyEmployeeKey(["Name", "Employee #", "Gross"])).toBe("Employee #");
    expect(detectLegacyEmployeeKey(["Name", "EmpCode", "Gross"])).toBe("EmpCode");
  });

  test("returns exact match for 'Employee ID' (case-insensitive)", () => {
    expect(detectLegacyEmployeeKey(["Department", "Employee ID", "Gross"])).toBe("Employee ID");
    expect(detectLegacyEmployeeKey(["department", "employee id", "gross"])).toBe("employee id");
  });
});
