function quoteField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeSourceCsv(
  headers: string[],
  rows: Record<string, string>[]
): string {
  const lines: string[] = [headers.map(quoteField).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => quoteField(row[h] ?? "")).join(","));
  }
  return lines.join("\r\n");
}
