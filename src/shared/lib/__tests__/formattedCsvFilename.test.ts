import { test, expect, describe } from "bun:test";
import { formattedCsvFilename } from "@/lib/formattedCsvFilename";

describe("formattedCsvFilename", () => {
  test("strips extension and appends _formatted.csv", () => {
    expect(formattedCsvFilename("payroll.xlsx")).toBe("payroll_formatted.csv");
  });

  test("replaces .csv extension too", () => {
    expect(formattedCsvFilename("data.csv")).toBe("data_formatted.csv");
  });

  test("strips only the last extension when there are multiple dots", () => {
    expect(formattedCsvFilename("my.payroll.2024.xlsx")).toBe("my.payroll.2024_formatted.csv");
  });

  test("appends _formatted.csv when there is no extension", () => {
    expect(formattedCsvFilename("payroll")).toBe("payroll_formatted.csv");
  });
});
