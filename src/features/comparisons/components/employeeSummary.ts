export function computeEmployeeSummary(
  legacyKeys: string[],
  newKeys: string[],
  pairs: Array<{ legacy_key: string; new_key: string }>
): { matched: number; skippedLegacy: number; skippedNew: number } {
  const pairedLegacy = new Set(pairs.map((p) => p.legacy_key));
  const pairedNew = new Set(pairs.map((p) => p.new_key));

  return {
    matched: pairs.length,
    skippedLegacy: legacyKeys.filter((k) => !pairedLegacy.has(k)).length,
    skippedNew: newKeys.filter((k) => !pairedNew.has(k)).length,
  };
}
