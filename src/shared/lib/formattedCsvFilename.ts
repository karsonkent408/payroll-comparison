export function formattedCsvFilename(originalName: string): string {
  return originalName.replace(/\.[^.]+$/, "") + "_formatted.csv";
}
