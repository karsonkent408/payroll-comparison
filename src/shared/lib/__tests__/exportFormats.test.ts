import { test, expect } from "bun:test";
import { getExportFormats, formatSupportsDynamic } from "@/lib/exportFormats";

test("getExportFormats returns three options: CSV, Excel, Google Sheets", () => {
  const formats = getExportFormats();
  expect(formats.map((f) => f.id)).toEqual(["csv", "excel", "google-sheets"]);
});

test("CSV, Excel, and Google Sheets are all enabled", () => {
  const formats = getExportFormats();
  const byId = Object.fromEntries(formats.map((f) => [f.id, f]));
  expect(byId["csv"].enabled).toBe(true);
  expect(byId["excel"].enabled).toBe(true);
  expect(byId["google-sheets"].enabled).toBe(true);
});

test("CSV does not support dynamic ExportMode", () => {
  expect(formatSupportsDynamic("csv")).toBe(false);
});

test("Excel supports dynamic ExportMode", () => {
  expect(formatSupportsDynamic("excel")).toBe(true);
});

test("Google Sheets supports dynamic ExportMode", () => {
  expect(formatSupportsDynamic("google-sheets")).toBe(true);
});
