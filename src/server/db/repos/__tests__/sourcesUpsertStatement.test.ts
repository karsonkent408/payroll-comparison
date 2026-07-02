import { describe, test, expect } from "bun:test";
import { sourcesRepo } from "@/server/db/repos/sources";
import type { SQLiteWriteStatement } from "@/server/db/repos/columnMapping";

const input = {
  comparison_id: 42,
  type: "legacy" as const,
  file_name: "payroll.csv",
  headers: ["name", "gross"],
  rows: [{ name: "Alice", gross: "1000" }],
  detectedTypes: { name: "string" as const, gross: "number" as const },
  columnSections: {},
};

describe("sourcesRepo.buildUpsertStatement", () => {
  test("returns a statement object with toSQL", () => {
    const stmt: SQLiteWriteStatement = sourcesRepo.buildUpsertStatement(input);
    expect(typeof stmt.toSQL).toBe("function");
  });

  test("SQL is an INSERT INTO sources", () => {
    const { sql } = sourcesRepo.buildUpsertStatement(input).toSQL();
    expect(sql).toMatch(/insert into "?sources"?/i);
  });

  test("SQL includes ON CONFLICT (upsert behavior)", () => {
    const { sql } = sourcesRepo.buildUpsertStatement(input).toSQL();
    expect(sql).toMatch(/on conflict/i);
  });

  test("params include comparison_id and type", () => {
    const { params } = sourcesRepo.buildUpsertStatement(input).toSQL();
    expect(params).toContain(42);
    expect(params).toContain("legacy");
  });

  test("calling twice produces identical SQL (no side effects)", () => {
    const sql1 = sourcesRepo.buildUpsertStatement(input).toSQL().sql;
    const sql2 = sourcesRepo.buildUpsertStatement(input).toSQL().sql;
    expect(sql1).toBe(sql2);
  });
});
