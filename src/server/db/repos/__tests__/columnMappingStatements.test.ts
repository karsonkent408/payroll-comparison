import { describe, test, expect } from "bun:test";
import { columnMappingRepo } from "@/server/db/repos/columnMapping";
import type { SQLiteWriteStatement } from "@/server/db/repos/columnMapping";
import type { ColumnMappingEntryInput } from "@/server/api/util/types";

const entry: ColumnMappingEntryInput = {
  category: "Earnings",
  label: "Gross",
  tolerance: 0.01,
  display_order: 0,
  legacy_columns: ["gross"],
  new_columns: ["gross_pay"],
};

describe("columnMappingRepo.buildWriteStatements", () => {
  test("first statement is a delete for the comparison", () => {
    const statements = columnMappingRepo.buildWriteStatements(42, [entry], ["uuid-1"]);
    const { sql } = statements[0].toSQL();
    expect(sql).toMatch(/delete from/i);
    expect(sql).toContain("column_mapping");
  });

  test("delete statement filters by comparison_id", () => {
    const statements = columnMappingRepo.buildWriteStatements(42, [entry], ["uuid-1"]);
    const { params } = statements[0].toSQL();
    expect(params).toContain(42);
  });

  test("column_mapping inserts use the provided UUIDs as id", () => {
    const statements = columnMappingRepo.buildWriteStatements(1, [entry], ["my-uuid-abc"]);
    const mappingInsert = statements.find((s) =>
      /insert into "?column_mapping"?/i.test(s.toSQL().sql)
    );
    expect(mappingInsert).toBeDefined();
    expect(mappingInsert!.toSQL().params).toContain("my-uuid-abc");
  });

  test("includes column_pairing inserts referencing the entry UUID", () => {
    const statements = columnMappingRepo.buildWriteStatements(1, [entry], ["pairing-uuid"]);
    const pairingInsert = statements.find((s) =>
      /insert into "?column_pairing"?/i.test(s.toSQL().sql)
    );
    expect(pairingInsert).toBeDefined();
    expect(pairingInsert!.toSQL().params).toContain("pairing-uuid");
  });

  test("no column_pairing insert when entry has no columns", () => {
    const emptyEntry: ColumnMappingEntryInput = {
      ...entry,
      legacy_columns: [],
      new_columns: [],
    };
    const statements = columnMappingRepo.buildWriteStatements(1, [emptyEntry], ["uuid-empty"]);
    const pairingInsert = statements.find((s) =>
      /insert into "?column_pairing"?/i.test(s.toSQL().sql)
    );
    expect(pairingInsert).toBeUndefined();
  });

  test("includes a column_mapping insert for each entry", () => {
    const entries = [entry, { ...entry, label: "Bonus" }];
    const statements = columnMappingRepo.buildWriteStatements(1, entries, ["uuid-1", "uuid-2"]);
    const mappingInserts = statements.slice(1).filter((s) => {
      const { sql } = s.toSQL();
      return /insert into "?column_mapping"?/i.test(sql);
    });
    expect(mappingInserts).toHaveLength(2);
  });
});
