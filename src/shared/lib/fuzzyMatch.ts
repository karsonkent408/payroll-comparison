import type { FuzzyMatchCandidate } from "./types";
import { normalizeEmployeeKey } from "./normalizeEmployeeKey";

function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[\s\p{P}]+/u).filter(Boolean));
}

export function tokenOverlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}

export function computeFuzzyCandidatesFromKeys(
  legacyKeys: string[],
  newKeys: string[]
): FuzzyMatchCandidate[] {
  const uniqueLegacyKeys = [...new Set(legacyKeys.filter(Boolean))];
  const uniqueNewKeys = [...new Set(newKeys.filter(Boolean))];
  const normalizedNewKeys = new Set(uniqueNewKeys.map(normalizeEmployeeKey));

  const candidates: Omit<FuzzyMatchCandidate, "conflict">[] = [];

  for (const lk of uniqueLegacyKeys) {
    if (normalizedNewKeys.has(normalizeEmployeeKey(lk))) continue;

    for (const mk of uniqueNewKeys) {
      const overlap = tokenOverlap(lk, mk);
      if (overlap > 0) {
        candidates.push({ legacy_key: lk, new_key: mk, overlap });
      }
    }
  }

  const newKeyCount = new Map<string, number>();
  for (const c of candidates) {
    newKeyCount.set(c.new_key, (newKeyCount.get(c.new_key) ?? 0) + 1);
  }

  return candidates.map((c) => ({
    ...c,
    conflict: (newKeyCount.get(c.new_key) ?? 0) > 1,
  }));
}
