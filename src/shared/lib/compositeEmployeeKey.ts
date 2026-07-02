export function compositeEmployeeKey(row: Record<string, string>, columns: string[]): string {
  return columns.map((c) => row[c] ?? "").join(" ").trim();
}
