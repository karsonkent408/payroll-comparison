import { describe, test, expect } from "bun:test";
import { resultRepo } from "@/server/db/repos/results";
import type { ComparisonResult, StoredMappingEntry } from "@/lib/types";

const entryKey = JSON.stringify([["gross"], ["gross_pay"]]);

const entry: StoredMappingEntry = {
  id: "cm-uuid-1",
  mapping_id: 1,
  legacy_columns: ["gross"],
  new_columns: ["gross_pay"],
  tolerance: 0.01,
  category: "Earnings",
  display_order: 0,
  label: "Gross",
};

const matchedResult: ComparisonResult = {
  matched: [
    {
      employee_key: "EMP001",
      results: [
        {
          entry: { legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0.01 },
          legacy_value: 1000,
          legacy_breakdown: null,
          new_value: 1000,
          new_breakdown: null,
          difference: 0,
          auto_status: "resolved",
        },
      ],
    },
  ],
  unmatched: [],
};

const emptyResult: ComparisonResult = { matched: [], unmatched: [] };

const entryMap = new Map([[entryKey, entry]]);

describe("resultRepo.buildPersistStatements", () => {
  test("first statement deletes stale unmatched pairings for the comparison", () => {
    const statements = resultRepo.buildPersistStatements(
      42,
      emptyResult,
      new Map(),
      new Map(),
      entryMap,
    );
    const { sql, params } = statements[0].toSQL();
    expect(sql).toMatch(/delete from/i);
    expect(sql).toContain("employee_pairings");
    expect(params).toContain(42);
  });

  test("existing matched pairing is not re-inserted so its stored keys (incl. fuzzy new_key) are preserved", () => {
    const existingPairings = new Map([["EMP001", "existing-uuid-abc"]]);
    const statements = resultRepo.buildPersistStatements(
      1,
      matchedResult,
      existingPairings,
      new Map(),
      entryMap,
    );
    const pairingInserts = statements.filter((s) =>
      /insert into "?employee_pairings"?/i.test(s.toSQL().sql)
    );
    expect(pairingInserts).toHaveLength(0);
  });

  test("new matched employee uses caller-provided UUID from newPairingIds", () => {
    const statements = resultRepo.buildPersistStatements(
      1,
      matchedResult,
      new Map(),
      new Map([["EMP001", "new-uuid-xyz"]]),
      entryMap,
    );
    const pairingUpsert = statements.find((s) =>
      /insert into "?employee_pairings"?/i.test(s.toSQL().sql)
    );
    expect(pairingUpsert).toBeDefined();
    expect(pairingUpsert!.toSQL().params).toContain("new-uuid-xyz");
  });

  test("mapping_entry statement carries the correct column_mapping_id", () => {
    const statements = resultRepo.buildPersistStatements(
      1,
      matchedResult,
      new Map([["EMP001", "ep-uuid-1"]]),
      new Map(),
      entryMap,
    );
    const entryInsert = statements.find((s) =>
      /insert into "?mapping_entries"?/i.test(s.toSQL().sql)
    );
    expect(entryInsert).toBeDefined();
    expect(entryInsert!.toSQL().params).toContain("cm-uuid-1");
  });

  test("mapping_entry statement carries the correct employee_pairing_id", () => {
    const statements = resultRepo.buildPersistStatements(
      1,
      matchedResult,
      new Map([["EMP001", "ep-uuid-1"]]),
      new Map(),
      entryMap,
    );
    const entryInsert = statements.find((s) =>
      /insert into "?mapping_entries"?/i.test(s.toSQL().sql)
    );
    expect(entryInsert).toBeDefined();
    expect(entryInsert!.toSQL().params).toContain("ep-uuid-1");
  });

  test("stale mapping_entries delete is included when there are matched pairings", () => {
    const statements = resultRepo.buildPersistStatements(
      1,
      matchedResult,
      new Map([["EMP001", "ep-uuid-1"]]),
      new Map(),
      entryMap,
    );
    const staleDelete = statements.filter((s) => {
      const { sql } = s.toSQL();
      return /delete from/i.test(sql) && sql.includes("mapping_entries");
    });
    expect(staleDelete.length).toBeGreaterThan(0);
  });

  test("stale matched employee_pairings delete is included when there are matched pairings", () => {
    const statements = resultRepo.buildPersistStatements(
      1,
      matchedResult,
      new Map([["EMP001", "ep-uuid-1"]]),
      new Map(),
      entryMap,
    );
    const staleDeletes = statements.filter((s) => {
      const { sql } = s.toSQL();
      return /delete from/i.test(sql) && sql.includes("employee_pairings");
    });
    // first delete is the unmatched cleanup, second+ is stale matched cleanup
    expect(staleDeletes.length).toBeGreaterThanOrEqual(2);
  });

  test("inserts employee_pairings row for each unmatched employee", () => {
    const resultWithUnmatched: ComparisonResult = {
      matched: [],
      unmatched: [
        { employee_key: "LEGACY001", source: "legacy" },
        { employee_key: "NEW001", source: "new" },
      ],
    };
    const statements = resultRepo.buildPersistStatements(
      1,
      resultWithUnmatched,
      new Map(),
      new Map(),
      entryMap,
    );
    const unmatchedInserts = statements.filter((s) =>
      /insert into "?employee_pairings"?/i.test(s.toSQL().sql)
    );
    expect(unmatchedInserts).toHaveLength(2);
  });
});
