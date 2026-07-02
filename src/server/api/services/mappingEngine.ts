import type { ColumnMapping, MappingEntry, ValidationResult, HeaderDiff, FlaggedEntry, CopyMappingResult, ComparisonCategory, StoredEntryShape } from "@/lib/types";
export type { ColumnMapping, MappingEntry, ValidationResult, HeaderDiff, FlaggedEntry, CopyMappingResult } from "@/lib/types";

export function validateMapping(
  mapping: ColumnMapping,
  legacyHeaders: string[],
  newHeaders: string[]
): ValidationResult {
  const errors: string[] = [];

  if (
    mapping.employee_match_mode !== undefined &&
    mapping.employee_match_mode !== "exact" &&
    mapping.employee_match_mode !== "fuzzy"
  ) {
    errors.push(
      `employee_match_mode must be "exact" or "fuzzy", got "${mapping.employee_match_mode}"`
    );
  }

  if (mapping.legacy_employee_key.length === 0) {
    errors.push("legacy_employee_key must have at least one column");
  }
  for (const col of mapping.legacy_employee_key) {
    if (!legacyHeaders.includes(col)) {
      errors.push(`EmployeeKey column "${col}" not found in Legacy headers`);
    }
  }

  if (mapping.new_employee_key.length === 0) {
    errors.push("new_employee_key must have at least one column");
  }
  for (const col of mapping.new_employee_key) {
    if (!newHeaders.includes(col)) {
      errors.push(`EmployeeKey column "${col}" not found in New headers`);
    }
  }

  const seen = new Set<string>();
  for (const entry of mapping.entries) {
    const key = JSON.stringify([
      [...entry.legacy_columns].sort(),
      [...entry.new_columns].sort(),
    ]);
    if (seen.has(key)) {
      errors.push(`Duplicate MappingEntry: [${entry.legacy_columns}] → [${entry.new_columns}]`);
    } else {
      seen.add(key);
    }

  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

type MappingShape = {
  legacy_employee_key: string[];
  new_employee_key: string[];
  entries: { legacy_columns: string[]; new_columns: string[] }[];
};

export function diffHeaders(
  mapping: MappingShape,
  newHeaders: string[],
  sourceType: "legacy" | "new"
): HeaderDiff {
  const headerSet = new Set(newHeaders);

  const employeeKey =
    sourceType === "legacy" ? mapping.legacy_employee_key : mapping.new_employee_key;

  const mappedCols = new Set<string>();
  for (const c of employeeKey) mappedCols.add(c);
  for (const entry of mapping.entries) {
    const cols = sourceType === "legacy" ? entry.legacy_columns : entry.new_columns;
    for (const c of cols) mappedCols.add(c);
  }

  const removed = [...mappedCols].filter((c) => !headerSet.has(c));
  const added = newHeaders.filter((c) => !mappedCols.has(c));

  return { added, removed };
}

type PriorMappingShape = {
  legacy_employee_key: string[];
  new_employee_key: string[];
  entries: StoredEntryShape[];
};

export function copyMapping(
  prior: PriorMappingShape,
  newLegacyHeaders: string[],
  newNewHeaders: string[]
): CopyMappingResult {
  const legacySet = new Set(newLegacyHeaders);
  const newSet = new Set(newNewHeaders);

  const flagged: FlaggedEntry[] = [];
  const entries = prior.entries.map((e) => {
    const missing_legacy = e.legacy_columns.filter((c) => !legacySet.has(c));
    const missing_new  = e.new_columns.filter((c) => !newSet.has(c));
    if (missing_legacy.length > 0 || missing_new.length > 0) {
      flagged.push({ ...e, missing_legacy, missing_new });
    }
    return { ...e, missing_legacy, missing_new };
  });

  return {
    mapping: {
      legacy_employee_key: prior.legacy_employee_key,
      new_employee_key: prior.new_employee_key,
      entries,
    },
    flagged,
  };
}
