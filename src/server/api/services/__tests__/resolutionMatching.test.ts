import { test, expect, describe } from "bun:test";
import { columnSetsMatch, pairMatchedEntries } from "@/server/api/services/resolutionMatching";

describe("pairMatchedEntries", () => {
  test("pairs entries with matching column sets", () => {
    const old = [
      { legacy_columns: ["gross"], new_columns: ["gross_pay"], id: 1 },
      { legacy_columns: ["bonus"], new_columns: ["bonus_pay"], id: 2 },
    ];
    const next = [
      { legacy_columns: ["gross"], new_columns: ["gross_pay"], id: 10 },
      { legacy_columns: ["tax"], new_columns: ["tax_pay"], id: 11 },
    ];
    const pairs = pairMatchedEntries(old, next);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].old.id).toBe(1);
    expect(pairs[0].new.id).toBe(10);
  });

  test("no old entries yields empty result", () => {
    const pairs = pairMatchedEntries([], [
      { legacy_columns: ["gross"], new_columns: ["gross_pay"] },
    ]);
    expect(pairs).toHaveLength(0);
  });

  test("no new entries yields empty result", () => {
    const pairs = pairMatchedEntries([
      { legacy_columns: ["gross"], new_columns: ["gross_pay"] },
    ], []);
    expect(pairs).toHaveLength(0);
  });

  test("multi-column entries pair correctly regardless of order", () => {
    const old = [{ legacy_columns: ["gross", "overtime"], new_columns: ["gross_pay", "ot_pay"] }];
    const next = [{ legacy_columns: ["overtime", "gross"], new_columns: ["ot_pay", "gross_pay"] }];
    const pairs = pairMatchedEntries(old, next);
    expect(pairs).toHaveLength(1);
  });
});

describe("columnSetsMatch", () => {
  test("exact match returns true", () => {
    expect(
      columnSetsMatch(
        { legacy_columns: ["gross"], new_columns: ["gross_pay"] },
        { legacy_columns: ["gross"], new_columns: ["gross_pay"] }
      )
    ).toBe(true);
  });

  test("reordered legacy_columns still matches", () => {
    expect(
      columnSetsMatch(
        { legacy_columns: ["gross", "bonus"], new_columns: ["gross_pay"] },
        { legacy_columns: ["bonus", "gross"], new_columns: ["gross_pay"] }
      )
    ).toBe(true);
  });

  test("reordered new_columns still matches", () => {
    expect(
      columnSetsMatch(
        { legacy_columns: ["gross"], new_columns: ["gross_pay", "bonus_pay"] },
        { legacy_columns: ["gross"], new_columns: ["bonus_pay", "gross_pay"] }
      )
    ).toBe(true);
  });

  test("multi-column entry matches another multi-column entry with same sets", () => {
    expect(
      columnSetsMatch(
        { legacy_columns: ["gross", "overtime"], new_columns: ["gross_pay", "ot_pay"] },
        { legacy_columns: ["overtime", "gross"], new_columns: ["ot_pay", "gross_pay"] }
      )
    ).toBe(true);
  });

  test("extra column in new entry returns false", () => {
    expect(
      columnSetsMatch(
        { legacy_columns: ["gross"], new_columns: ["gross_pay"] },
        { legacy_columns: ["gross", "bonus"], new_columns: ["gross_pay"] }
      )
    ).toBe(false);
  });

  test("missing column in new entry returns false", () => {
    expect(
      columnSetsMatch(
        { legacy_columns: ["gross", "bonus"], new_columns: ["gross_pay"] },
        { legacy_columns: ["gross"], new_columns: ["gross_pay"] }
      )
    ).toBe(false);
  });
});
