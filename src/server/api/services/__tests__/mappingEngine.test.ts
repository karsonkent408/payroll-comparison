import { test, expect, describe } from "bun:test";
import { validateMapping, diffHeaders, copyMapping } from "@/server/api/services/mappingEngine";

const legacyHeaders = ["emp_id", "name", "gross", "net", "tax"];
const newHeaders = ["employee_id", "full_name", "gross_pay", "net_pay", "fed_tax"];

describe("validateMapping", () => {
  test("valid ColumnMapping returns ok", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        entries: [
          { legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0 },
          { legacy_columns: ["net"], new_columns: ["net_pay"], tolerance: 0 },
        ],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result).toEqual({ ok: true });
  });

  test("missing legacy_employee_key reports an error", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["does_not_exist"],
        new_employee_key: ["employee_id"],
        entries: [],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/EmployeeKey/);
    expect(result.errors[0]).toMatch(/Legacy/);
  });

  test("MappingEntry referencing a legacy column absent from headers passes validation", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        entries: [
          { legacy_columns: ["ghost_column"], new_columns: ["gross_pay"], tolerance: 0 },
        ],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result).toEqual({ ok: true });
  });

  test("MappingEntry referencing a new column absent from headers passes validation", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        entries: [
          { legacy_columns: ["gross"], new_columns: ["ghost_column"], tolerance: 0 },
        ],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result).toEqual({ ok: true });
  });

  test("duplicate MappingEntry (same legacy + new columns) reports an error", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        entries: [
          { legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0 },
          { legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0 },
        ],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.errors.some((e) => /duplicate/i.test(e))).toBe(true);
  });

  test("all errors are collected and returned together", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["missing_key"],   // bad EmployeeKey
        new_employee_key: ["also_missing"],   // bad EmployeeKey
        entries: [
          { legacy_columns: ["ghost"], new_columns: ["gross_pay"], tolerance: 0 }, // absent column — no longer an error
        ],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  test("entries with different columns are not duplicates", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        entries: [
          { legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0 },
          { legacy_columns: ["net"], new_columns: ["net_pay"], tolerance: 0 },
        ],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result).toEqual({ ok: true });
  });

  test("invalid employee_match_mode reports an error", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        employee_match_mode: "typo" as never,
        entries: [],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.errors.some((e) => /employee_match_mode/i.test(e))).toBe(true);
  });

  test("employee_match_mode 'exact' is accepted", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        employee_match_mode: "exact",
        entries: [],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result).toEqual({ ok: true });
  });

  test("employee_match_mode 'fuzzy' is accepted", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        employee_match_mode: "fuzzy",
        entries: [],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result).toEqual({ ok: true });
  });

  test("missing new_employee_key reports an error", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["does_not_exist"],
        entries: [],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/EmployeeKey/);
    expect(result.errors[0]).toMatch(/New/);
  });

  test("empty legacy_employee_key array reports an error", () => {
    const result = validateMapping(
      {
        legacy_employee_key: [],
        new_employee_key: ["employee_id"],
        entries: [],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/legacy_employee_key/);
  });

  test("MappingEntry with a legacy column absent from headers passes validation", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        entries: [{ legacy_columns: ["pto"], new_columns: ["gross_pay"], tolerance: 0 }],
      },
      legacyHeaders, // "pto" is not in legacyHeaders
      newHeaders
    );

    expect(result).toEqual({ ok: true });
  });

  test("MappingEntry with a new column absent from headers passes validation", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: ["employee_id"],
        entries: [{ legacy_columns: ["gross"], new_columns: ["pto_pay"], tolerance: 0 }],
      },
      legacyHeaders,
      newHeaders // "pto_pay" is not in newHeaders
    );

    expect(result).toEqual({ ok: true });
  });

  test("empty new_employee_key array reports an error", () => {
    const result = validateMapping(
      {
        legacy_employee_key: ["emp_id"],
        new_employee_key: [],
        entries: [],
      },
      legacyHeaders,
      newHeaders
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/new_employee_key/);
  });
});

const baseMapping = {
  legacy_employee_key: ["emp_id"],
  new_employee_key: ["employee_id"],
  entries: [
    { legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0 },
    { legacy_columns: ["net"],   new_columns: ["net_pay"] },
  ],
};

describe("diffHeaders", () => {
  test("returns empty removed and lists added columns when headers fully cover the mapping", () => {
    const result = diffHeaders(baseMapping, ["emp_id", "gross", "net", "bonus"], "legacy");
    expect(result.removed).toEqual([]);
    expect(result.added).toContain("bonus");
  });

  test("returns removed columns when a mapped column is missing from new headers", () => {
    // "net" was in the mapping but has been dropped from the new upload
    const result = diffHeaders(baseMapping, ["emp_id", "gross"], "legacy");
    expect(result.removed).toContain("net");
    expect(result.removed).not.toContain("gross");
  });

  test("returns added columns for headers not referenced by the mapping", () => {
    const result = diffHeaders(baseMapping, ["emp_id", "gross", "net", "overtime", "bonus"], "legacy");
    expect(result.added).toContain("overtime");
    expect(result.added).toContain("bonus");
    // mapped columns should not appear as added
    expect(result.added).not.toContain("gross");
    expect(result.added).not.toContain("emp_id");
  });

  test("flags missing employee key as removed", () => {
    // The employee key column itself has been renamed/removed
    const result = diffHeaders(baseMapping, ["worker_id", "gross", "net"], "legacy");
    expect(result.removed).toContain("emp_id");
  });
});

const priorMapping = {
  id: 1,
  comparison_id: 1,
  legacy_employee_key: ["emp_id"],
  new_employee_key: ["employee_id"],
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  entries: [
    { id: 1, mapping_id: 1, legacy_columns: ["gross"], new_columns: ["gross_pay"], tolerance: 0.01, category: "Earnings" as const, display_order: 0 },
    { id: 2, mapping_id: 1, legacy_columns: ["net"],   new_columns: ["net_pay"],   tolerance: 0.01, category: "Net"      as const, display_order: 1 },
  ],
};

describe("copyMapping", () => {
  test("returns no flagged entries when all columns exist in new headers", () => {
    const result = copyMapping(
      priorMapping,
      ["emp_id", "gross", "net"],
      ["employee_id", "gross_pay", "net_pay"]
    );
    expect(result.flagged).toEqual([]);
    expect(result.mapping.entries).toHaveLength(2);
  });

  test("flags an entry when a legacy column is missing from new headers", () => {
    // "net" dropped from legacy
    const result = copyMapping(
      priorMapping,
      ["emp_id", "gross"],
      ["employee_id", "gross_pay", "net_pay"]
    );
    expect(result.flagged).toHaveLength(1);
    expect(result.flagged[0].missing_legacy).toContain("net");
    expect(result.flagged[0].missing_new).toEqual([]);
  });

  test("flags an entry when a new column is missing from new headers", () => {
    // "gross_pay" dropped from new
    const result = copyMapping(
      priorMapping,
      ["emp_id", "gross", "net"],
      ["employee_id", "net_pay"]
    );
    expect(result.flagged).toHaveLength(1);
    expect(result.flagged[0].missing_new).toContain("gross_pay");
    expect(result.flagged[0].missing_legacy).toEqual([]);
  });

  test("flagged entries are still included in the output mapping", () => {
    const result = copyMapping(
      priorMapping,
      ["emp_id", "gross"],   // "net" missing
      ["employee_id", "gross_pay", "net_pay"]
    );
    // Both entries present in mapping even though one is flagged
    expect(result.mapping.entries).toHaveLength(2);
    const netEntry = result.mapping.entries.find((e) => e.legacy_columns.includes("net"));
    expect(netEntry).toBeDefined();
    expect(netEntry!.missing_legacy).toContain("net");
  });

  test("entry for a previously-absent column is not flagged when that column now exists in new headers", () => {
    // Simulates a manually-entered column (e.g. PTO not yet in New) that has since been added
    const mappingWithAbsentColumn = {
      ...priorMapping,
      entries: [
        ...priorMapping.entries,
        { id: 3, mapping_id: 1, legacy_columns: ["pto"], new_columns: ["pto_pay"], tolerance: 0.01, category: "Earnings" as const, display_order: 2 },
      ],
    };

    const result = copyMapping(
      mappingWithAbsentColumn,
      ["emp_id", "gross", "net", "pto"],       // pto now present
      ["employee_id", "gross_pay", "net_pay", "pto_pay"] // pto_pay now present
    );

    expect(result.flagged).toEqual([]);
    const ptoEntry = result.mapping.entries.find((e) => e.legacy_columns.includes("pto"));
    expect(ptoEntry).toBeDefined();
    expect(ptoEntry!.missing_legacy).toEqual([]);
    expect(ptoEntry!.missing_new).toEqual([]);
  });

  test("a third entry is carried through with the same flag logic", () => {
    const mappingWithBonus = {
      ...priorMapping,
      entries: [
        ...priorMapping.entries,
        { id: 3, mapping_id: 1, legacy_columns: ["bonus"], new_columns: ["bonus_pay"], tolerance: 0.01, category: "Earnings" as const, display_order: 2 },
      ],
    };
    // "bonus" present — should not be flagged
    const allPresent = copyMapping(
      mappingWithBonus,
      ["emp_id", "gross", "net", "bonus"],
      ["employee_id", "gross_pay", "net_pay", "bonus_pay"]
    );
    expect(allPresent.flagged).toEqual([]);
    expect(allPresent.mapping.entries).toHaveLength(3);

    // "bonus" absent — entry should be flagged
    const bonusMissing = copyMapping(
      mappingWithBonus,
      ["emp_id", "gross", "net"],
      ["employee_id", "gross_pay", "net_pay"]
    );
    expect(bonusMissing.flagged).toHaveLength(1);
    expect(bonusMissing.flagged[0].legacy_columns).toEqual(["bonus"]);
  });
});
