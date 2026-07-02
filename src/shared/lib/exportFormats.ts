export type ExportFormat = {
  id: "csv" | "excel" | "google-sheets";
  label: string;
  enabled: boolean;
};

export type ExportMode = "static" | "dynamic";

export function getExportFormats(): ExportFormat[] {
  return [
    { id: "csv", label: "CSV", enabled: true },
    { id: "excel", label: "Excel", enabled: true },
    { id: "google-sheets", label: "Google Sheets", enabled: true },
  ];
}

export function formatSupportsDynamic(formatId: ExportFormat["id"]): boolean {
  return formatId !== "csv";
}
