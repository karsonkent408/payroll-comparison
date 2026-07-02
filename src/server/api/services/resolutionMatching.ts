import type { EntryColumnSet } from "@/lib/types";
export type { EntryColumnSet } from "@/lib/types";

function sortedKey(entry: EntryColumnSet): string {
  return JSON.stringify([
    [...entry.legacy_columns].sort(),
    [...entry.new_columns].sort(),
  ]);
}

export function columnSetsMatch(a: EntryColumnSet, b: EntryColumnSet): boolean {
  return sortedKey(a) === sortedKey(b);
}

export function pairMatchedEntries<T extends EntryColumnSet>(
  oldEntries: T[],
  newEntries: T[]
): Array<{ old: T; new: T }> {
  const pairs: Array<{ old: T; new: T }> = [];
  for (const newEntry of newEntries) {
    const match = oldEntries.find((old) => columnSetsMatch(old, newEntry));
    if (match) pairs.push({ old: match, new: newEntry });
  }
  return pairs;
}
