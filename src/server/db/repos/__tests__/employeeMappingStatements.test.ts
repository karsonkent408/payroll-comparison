import { describe, test, expect } from "bun:test";
import { employeeMappingRepo } from "@/server/db/repos/employeeMapping";
import type { EmployeeMappingInput } from "@/server/db/repos/employeeMapping";

const input: EmployeeMappingInput = {
  legacy_employee_key: ["emp_id"],
  new_employee_key: ["employee_id"],
  employee_match_mode: "exact",
  new_first_name_column: null,
  new_last_name_column: null,
};

describe("employeeMappingRepo.buildUpsertStatements", () => {
  test("returns exactly two statements", () => {
    const statements = employeeMappingRepo.buildUpsertStatements(42, input);
    expect(statements).toHaveLength(2);
  });

  test("first statement is a DELETE from employee_mapping for the comparison", () => {
    const statements = employeeMappingRepo.buildUpsertStatements(42, input);
    const { sql, params } = statements[0].toSQL();
    expect(sql).toMatch(/delete from/i);
    expect(sql).toContain("employee_mapping");
    expect(params).toContain(42);
  });

  test("second statement is an INSERT into employee_mapping", () => {
    const statements = employeeMappingRepo.buildUpsertStatements(42, input);
    const { sql } = statements[1].toSQL();
    expect(sql).toMatch(/insert into "?employee_mapping"?/i);
  });

  test("INSERT includes serialized legacy and new employee keys", () => {
    const statements = employeeMappingRepo.buildUpsertStatements(1, input);
    const { params } = statements[1].toSQL();
    expect(params).toContain(JSON.stringify(["emp_id"]));
    expect(params).toContain(JSON.stringify(["employee_id"]));
  });

  test("INSERT includes employee_match_mode", () => {
    const statementsExact = employeeMappingRepo.buildUpsertStatements(1, input);
    expect(statementsExact[1].toSQL().params).toContain("exact");

    const fuzzyInput: EmployeeMappingInput = { ...input, employee_match_mode: "fuzzy" };
    const statementsFuzzy = employeeMappingRepo.buildUpsertStatements(1, fuzzyInput);
    expect(statementsFuzzy[1].toSQL().params).toContain("fuzzy");
  });
});
