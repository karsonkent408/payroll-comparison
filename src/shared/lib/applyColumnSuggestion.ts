import type { ColumnSuggestion } from "@/server/api/services/aiMapper";
import type { ComparisonCategory } from "@/lib/types";

type EntryDraft = {
  id: string;
  legacy_columns: string[];
  new_columns: string[];
  category: ComparisonCategory;
  tolerance: string;
  label: string;
  labelEdited: boolean;
  [key: string]: unknown;
};

export function applyColumnSuggestion<T extends EntryDraft>(
  entries: T[],
  suggestion: ColumnSuggestion,
  legacyHeaders?: string[],
  newHeaders?: string[]
): { entries: (T | EntryDraft)[] } {
  const suggestionMap = new Map(
    suggestion.mappings.map((m) => [JSON.stringify(m.new_columns.slice().sort()), m])
  );

  const matchedKeys = new Set<string>();

  // Update existing entries
  const updatedEntries: (T | EntryDraft)[] = entries.map((entry) => {
    const hasAbsentColumn =
      (legacyHeaders && entry.legacy_columns.some((c) => !legacyHeaders.includes(c))) ||
      (newHeaders && entry.new_columns.some((c) => !newHeaders.includes(c)));
    if (hasAbsentColumn) {
      const key = JSON.stringify(entry.new_columns.slice().sort());
      if (suggestionMap.has(key)) matchedKeys.add(key);
      return entry;
    }

    const key = JSON.stringify(entry.new_columns.slice().sort());
    const match = suggestionMap.get(key);
    if (!match) return entry;
    matchedKeys.add(key);
    if (entry.legacy_columns.length > 0) return entry;
    if (!match.legacy_column) return entry;
    return { ...entry, legacy_columns: [match.legacy_column] };
  });

  // Create new entries for suggestions with no existing entry,
  // filtering out any New columns already claimed (including by earlier new entries).
  const usedNewColumns = new Set(updatedEntries.flatMap((e) => e.new_columns));

  for (const [key, m] of suggestionMap) {
    if (matchedKeys.has(key)) continue;
    const freshNewColumns = m.new_columns.filter((c) => !usedNewColumns.has(c));
    if (freshNewColumns.length === 0) continue;
    for (const c of freshNewColumns) usedNewColumns.add(c);
    updatedEntries.push({
      id: crypto.randomUUID(),
      legacy_columns: m.legacy_column ? [m.legacy_column] : [],
      new_columns: freshNewColumns,
      category: m.category,
      tolerance: "0.01",
      label: m.label,
      labelEdited: m.label !== "",
    });
  }

  return { entries: updatedEntries };
}
