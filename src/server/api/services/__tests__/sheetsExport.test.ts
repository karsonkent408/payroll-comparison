import { test, expect, describe } from "bun:test";
import { sheetsExport } from "@/server/api/services/sheetsExport";
import type { StoredResults } from "@/server/db/repos/results";
import type { StoredColumnMapping } from "@/lib/types";

const baseMapping: StoredColumnMapping = {
  id: 1,
  comparison_id: 1,
  legacy_employee_key: ["emp_id"],
  new_employee_key: ["employee_id"],
  employee_match_mode: "exact",
  new_first_name_column: "First Name",
  new_last_name_column: "Last Name",
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  entries: [
    {
      id: "1",
      mapping_id: 1,
      legacy_columns: ["gross"],
      new_columns: ["gross_pay"],
      tolerance: 0.01,
      category: "Earnings",
      display_order: 0,
      label: "Gross",
    },
  ],
};

const baseResults: StoredResults = {
  matched: [
    {
      employee_key: "101",
      employee_name: "Alice Smith",
      results: [
        {
          id: 1,
          column_entry_id: "1",
          legacy_columns: ["gross"],
          new_columns: ["gross_pay"],
          category: "Earnings",
          label: "Gross",
          display_order: 0,
          legacy_value: 1000,
          legacy_breakdown: null,
          new_value: 1000,
          new_breakdown: null,
          difference: 0,
          tolerance: 0.01,
          auto_status: "resolved",
          manual_override: null,
          note: null,
        },
      ],
    },
  ],
  unmatched: [],
};

const baseComparison = { label: "Jan 2024", pay_period_start: "2024-01-01", pay_period_end: "2024-01-31" };

function makeMockFetch(spreadsheetUrl = "https://docs.google.com/spreadsheets/d/abc123") {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (url.includes("/values")) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return new Response(
      JSON.stringify({ spreadsheetId: "abc123", spreadsheetUrl, sheets: [{ properties: { sheetId: 0 } }] }),
      { status: 200 }
    );
  };
  return { fetchFn, calls };
}

describe("sheetsExport", () => {
  test("returns the spreadsheet URL on success", async () => {
    const { fetchFn } = makeMockFetch("https://docs.google.com/spreadsheets/d/abc123");
    const url = await sheetsExport(baseResults, baseMapping, baseComparison, "tok-123", fetchFn);
    expect(url).toBe("https://docs.google.com/spreadsheets/d/abc123");
  });

  test("spreadsheet title is label - pay_period_start to pay_period_end", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExport(baseResults, baseMapping, baseComparison, "tok", fetchFn);
    const createCall = calls.find((c) => !c.url.includes("/values") && (c.init.method === "POST" || !c.init.method));
    const body = JSON.parse(createCall!.init.body as string) as { properties: { title: string } };
    expect(body.properties.title).toBe("Jan 2024 - 2024-01-01 to 2024-01-31");
  });

  test("passes access token in Authorization header on all fetch calls", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExport(baseResults, baseMapping, baseComparison, "tok-abc", fetchFn);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const headers = new Headers(call.init.headers as HeadersInit);
      expect(headers.get("Authorization")).toBe("Bearer tok-abc");
    }
  });

  test("category header row contains the category name", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExport(baseResults, baseMapping, baseComparison, "tok", fetchFn);
    const updateCall = calls.find((c) => c.url.includes("/values"));
    expect(updateCall).toBeDefined();
    const body = JSON.parse(updateCall!.init.body as string) as {
      data: { values: (string | null)[][] }[]
    };
    const allValues = body.data.flatMap((d) => d.values);
    const categoryRow = allValues[0];
    expect(categoryRow).toContain("Earnings");
  });

  test("entry-label row uses category-prefixed column names", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExport(baseResults, baseMapping, baseComparison, "tok", fetchFn);
    const updateCall = calls.find((c) => c.url.includes("/values"));
    const body = JSON.parse(updateCall!.init.body as string) as {
      data: { values: (string | null)[][] }[]
    };
    const allValues = body.data.flatMap((d) => d.values);
    const labelRow = allValues[1];
    expect(labelRow).toContain("Employee ID");
    expect(labelRow).toContain("Earnings - Gross Legacy");
    expect(labelRow).toContain("Earnings - Gross New");
    expect(labelRow).toContain("Earnings - Gross Status");
  });

  test("employee data appears in the correct data row", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExport(baseResults, baseMapping, baseComparison, "tok", fetchFn);
    const updateCall = calls.find((c) => c.url.includes("/values"));
    const body = JSON.parse(updateCall!.init.body as string) as {
      data: { values: unknown[][] }[]
    };
    const allValues = body.data.flatMap((d) => d.values);
    const dataRow = allValues[2]; // row 0=category, 1=labels, 2=first data row
    expect(dataRow[0]).toBe("101");       // Employee ID
    expect(dataRow[1]).toBe("Alice Smith"); // Employee Name
    expect(dataRow[2]).toBe(1000);          // Legacy value
  });
});
