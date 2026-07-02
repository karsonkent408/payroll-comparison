import { test, expect, describe } from "bun:test";
import { listUnmappedColumns } from "../unmappedColumns";

const legacyHeaders = ["emp_id", "gross", "net", "bonus", "overtime"];
const newHeaders = ["employee_id", "emp_name", "gross_pay", "net_pay", "bonus_pay"];

describe("listUnmappedColumns", () => {
  test("all payroll columns mapped → both arrays are empty", () => {
    const result = listUnmappedColumns(
      legacyHeaders,
      newHeaders,
      [
        { legacy_columns: ["gross"], new_columns: ["gross_pay"] },
        { legacy_columns: ["net"], new_columns: ["net_pay"] },
        { legacy_columns: ["bonus"], new_columns: ["bonus_pay"] },
        { legacy_columns: ["overtime"], new_columns: [] },
      ],
      ["emp_id"],
      ["employee_id"],
      "emp_name",
      null
    );

    expect(result.unmappedLegacy).toEqual([]);
    expect(result.unmappedNew).toEqual([]);
  });

  test("some legacy columns unmapped → returns their names", () => {
    const result = listUnmappedColumns(
      legacyHeaders,
      newHeaders,
      [{ legacy_columns: ["gross"], new_columns: ["gross_pay"] }],
      ["emp_id"],
      ["employee_id"],
      "emp_name",
      null
    );

    expect(result.unmappedLegacy).toEqual(["net", "bonus", "overtime"]);
    expect(result.unmappedNew).toEqual(["net_pay", "bonus_pay"]);
  });

  test("employee key columns are excluded from both arrays", () => {
    const result = listUnmappedColumns(
      ["emp_id", "gross"],
      ["employee_id", "gross_pay"],
      [{ legacy_columns: ["gross"], new_columns: ["gross_pay"] }],
      ["emp_id"],
      ["employee_id"],
      null,
      null
    );

    expect(result.unmappedLegacy).toEqual([]);
    expect(result.unmappedNew).toEqual([]);
  });

  test("both new name columns are excluded from unmapped new array", () => {
    const result = listUnmappedColumns(
      ["emp_id", "gross"],
      ["employee_id", "First Name", "Last Name", "gross_pay"],
      [{ legacy_columns: ["gross"], new_columns: ["gross_pay"] }],
      ["emp_id"],
      ["employee_id"],
      "First Name",
      "Last Name"
    );

    expect(result.unmappedNew).toEqual([]);
  });

  test("only first name column configured: it is excluded, last name slot ignored", () => {
    const result = listUnmappedColumns(
      ["emp_id", "gross"],
      ["employee_id", "First Name", "gross_pay"],
      [{ legacy_columns: ["gross"], new_columns: ["gross_pay"] }],
      ["emp_id"],
      ["employee_id"],
      "First Name",
      null
    );

    expect(result.unmappedNew).toEqual([]);
  });

  test("null name columns do not incorrectly exclude anything", () => {
    const result = listUnmappedColumns(
      ["emp_id", "gross"],
      ["employee_id", "gross_pay", "extra"],
      [{ legacy_columns: ["gross"], new_columns: ["gross_pay"] }],
      ["emp_id"],
      ["employee_id"],
      null,
      null
    );

    expect(result.unmappedNew).toEqual(["extra"]);
  });

  test("multi-column entries count all referenced columns as mapped", () => {
    const result = listUnmappedColumns(
      ["emp_id", "regular", "overtime"],
      ["employee_id", "gross_pay"],
      [{ legacy_columns: ["regular", "overtime"], new_columns: ["gross_pay"] }],
      ["emp_id"],
      ["employee_id"],
      null,
      null
    );

    expect(result.unmappedLegacy).toEqual([]);
    expect(result.unmappedNew).toEqual([]);
  });

  test("empty entry list → all non-key columns are returned as unmapped", () => {
    const result = listUnmappedColumns(
      ["emp_id", "gross", "net"],
      ["employee_id", "gross_pay"],
      [],
      ["emp_id"],
      ["employee_id"],
      null,
      null
    );

    expect(result.unmappedLegacy).toEqual(["gross", "net"]);
    expect(result.unmappedNew).toEqual(["gross_pay"]);
  });

  test("two-element legacy key: both columns excluded from unmapped legacy", () => {
    const result = listUnmappedColumns(
      ["First Name", "Last Name", "gross"],
      ["employee_id", "gross_pay"],
      [{ legacy_columns: ["gross"], new_columns: ["gross_pay"] }],
      ["First Name", "Last Name"],
      ["employee_id"],
      null,
      null
    );

    expect(result.unmappedLegacy).toEqual([]);
    expect(result.unmappedNew).toEqual([]);
  });

  test("two-element new key: both columns excluded from unmapped new", () => {
    const result = listUnmappedColumns(
      ["emp_id", "gross"],
      ["First Name", "Last Name", "gross_pay"],
      [{ legacy_columns: ["gross"], new_columns: ["gross_pay"] }],
      ["emp_id"],
      ["First Name", "Last Name"],
      null,
      null
    );

    expect(result.unmappedNew).toEqual([]);
  });
});
