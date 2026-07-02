export function listUnmappedColumns(
  legacyHeaders: string[],
  newHeaders: string[],
  entries: { legacy_columns: string[]; new_columns: string[] }[],
  legacyKey: string[],
  newKey: string[],
  newFirstNameColumn: string | null,
  newLastNameColumn: string | null
): { unmappedLegacy: string[]; unmappedNew: string[] } {
  const mappedLegacy = new Set([...legacyKey, ...entries.flatMap((e) => e.legacy_columns)]);
  const mappedNew = new Set([
    ...newKey,
    ...(newFirstNameColumn ? [newFirstNameColumn] : []),
    ...(newLastNameColumn ? [newLastNameColumn] : []),
    ...entries.flatMap((e) => e.new_columns),
  ]);

  return {
    unmappedLegacy: legacyHeaders.filter((h) => !mappedLegacy.has(h)),
    unmappedNew: newHeaders.filter((h) => !mappedNew.has(h)),
  };
}
