import * as XLSX from "xlsx";
import type { ParseResult } from "@/lib/types";
export type { ParseResult } from "@/lib/types";

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK ZIP magic bytes

export function parseFile(buffer: Buffer, filename: string): ParseResult {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    return parseCsv(buffer);
  }

  if (ext === "xlsx" || ext === "xls") {
    return parseExcel(buffer);
  }

  return { ok: false, error: `Unsupported file type: .${ext}` };
}

function parseCsv(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8");
  const rawRows = parseCsvText(text);

  if (rawRows.length === 0) {
    return { ok: false, error: "CSV has no header row" };
  }

  let headerRow: string[];
  let dataRows: string[][];

  let columnSections: Record<string, string> = {};

  if (isGroupingRow(rawRows[0], rawRows[1])) {
    headerRow = applyGroupingPrefixes(rawRows[0], rawRows[1]);
    columnSections = buildColumnSections(rawRows[0], headerRow);
    dataRows = rawRows.slice(2);
  } else {
    headerRow = rawRows[0];
    dataRows = rawRows.slice(1);
  }

  const rows = dataRows.map((row) =>
    Object.fromEntries(headerRow.map((h, i) => [h, row[i] ?? ""]))
  );

  const detectedTypes = detectTypes(headerRow, rows);

  return { ok: true, headers: headerRow, rows, detectedTypes, columnSections };
}

function isGroupingRow(row1: string[], row2: string[] | undefined): boolean {
  if (!row2) return false;
  const total = Math.max(row1.length, row2.length);
  if (total === 0) return false;
  const nonEmpty = row1.filter((c) => c.trim() !== "").length;
  return nonEmpty / total < 0.5;
}

function applyGroupingPrefixes(groupRow: string[], headerRow: string[]): string[] {
  let currentSection = "";
  return headerRow.map((col, i) => {
    if (groupRow[i]?.trim()) currentSection = groupRow[i].trim();
    if (!currentSection || col.includes(currentSection)) return col;
    return `${currentSection} ${col}`;
  });
}

function buildColumnSections(groupRow: string[], prefixedHeaders: string[]): Record<string, string> {
  let currentSection = "";
  const sections: Record<string, string> = {};
  for (let i = 0; i < prefixedHeaders.length; i++) {
    if (groupRow[i]?.trim()) currentSection = groupRow[i].trim();
    if (currentSection) sections[prefixedHeaders[i]] = currentSection;
  }
  return sections;
}

function parseCsvText(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  // Drop trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  return lines.map(parseCsvLine);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    if (line[i] === '"') {
      let field = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }

    if (i > line.length) break;
  }

  return fields;
}

function parseExcel(buffer: Buffer): ParseResult {
  if (buffer.length < 4 || !buffer.slice(0, 4).equals(XLSX_MAGIC)) {
    return { ok: false, error: "File does not appear to be a valid Excel (.xlsx) file" };
  }

  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rawRows.length === 0) {
      return { ok: false, error: "Excel file has no header row" };
    }

    const headers = rawRows[0].map(String);
    const rows = rawRows.slice(1).map((row) =>
      Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? "")]))
    );

    const detectedTypes = detectTypes(headers, rows);

    return { ok: true, headers, rows, detectedTypes, columnSections: {} };
  } catch {
    return { ok: false, error: "Failed to parse Excel file" };
  }
}

const DATE_RE =
  /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\d{1,2}-\d{1,2}-\d{2,4}$/;

function detectTypes(
  headers: string[],
  rows: Record<string, string>[]
): Record<string, "number" | "string" | "date"> {
  const result: Record<string, "number" | "string" | "date"> = {};

  for (const header of headers) {
    const nonEmpty = rows.map((r) => r[header]).filter((v) => v !== "");
    if (nonEmpty.length === 0) {
      result[header] = "string";
      continue;
    }

    const numericCount = nonEmpty.filter((v) => !isNaN(Number(v))).length;
    if (numericCount / nonEmpty.length >= 0.9) {
      result[header] = "number";
      continue;
    }

    const dateCount = nonEmpty.filter((v) => DATE_RE.test(v) && !isNaN(Date.parse(v))).length;
    if (dateCount / nonEmpty.length >= 0.9) {
      result[header] = "date";
      continue;
    }

    result[header] = "string";
  }

  return result;
}
