import type { StoredResults } from "@/server/db/repos/results";
import type { StoredColumnMapping } from "@/lib/types";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

const CATEGORY_ORDER = [
  "Hours",
  "Earnings",
  "Non-Taxed Earnings",
  "FICA",
  "Benefits",
  "Deductions",
  "Taxes",
  "Fringes",
  "Net",
] as const;

function orderedEntries(mapping: StoredColumnMapping) {
  return [...mapping.entries].sort((a, b) => {
    const catA = CATEGORY_ORDER.indexOf(a.category as typeof CATEGORY_ORDER[number]);
    const catB = CATEGORY_ORDER.indexOf(b.category as typeof CATEGORY_ORDER[number]);
    if (catA !== catB) return catA - catB;
    return a.display_order - b.display_order;
  });
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function sheetsExport(
  results: StoredResults,
  mapping: StoredColumnMapping,
  comparison: { label: string; pay_period_start: string; pay_period_end: string },
  accessToken: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<string> {
  const entries = orderedEntries(mapping);
  const title = `${comparison.label} - ${comparison.pay_period_start} to ${comparison.pay_period_end}`;

  // Create spreadsheet
  const createRes = await fetchFn(SHEETS_API, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ properties: { title } }),
  });
  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Sheets API create failed (${createRes.status}): ${errBody}`);
  }
  const { spreadsheetId, spreadsheetUrl, sheets } = await createRes.json() as {
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets: { properties: { sheetId: number } }[];
  };
  const sheetId = sheets[0].properties.sheetId;

  // Build value grid
  const categoryRow: (string | null)[] = [null, null];
  const labelRow: string[] = ["Employee ID", "Employee Name"];
  let prevCategory: string | null = null;

  for (const entry of entries) {
    if (entry.category !== prevCategory) {
      categoryRow.push(entry.category);
      prevCategory = entry.category;
    } else {
      categoryRow.push(null);
    }
    categoryRow.push(null, null, null, null);
    labelRow.push(
      `${entry.category} - ${entry.label} Legacy`,
      `${entry.category} - ${entry.label} New`,
      `${entry.category} - ${entry.label} Difference`,
      `${entry.category} - ${entry.label} Status`,
      `${entry.category} - ${entry.label} Notes`
    );
  }

  const dataRows: unknown[][] = [];

  for (const employee of results.matched) {
    const row: unknown[] = [employee.employee_key, employee.employee_name];
    for (const entry of entries) {
      const result = employee.results.find((r) => r.column_entry_id === entry.id);
      if (result) {
        const status = result.manual_override ?? result.auto_status;
        row.push(result.legacy_value, result.new_value, result.legacy_value - result.new_value, status, result.note ?? "");
      } else {
        row.push("", "", "", "", "");
      }
    }
    dataRows.push(row);
  }

  for (const unmatched of results.unmatched) {
    const row: unknown[] = [unmatched.employee_key, unmatched.employee_name];
    for (let i = 0; i < entries.length; i++) {
      row.push("", "", "", "", "");
    }
    dataRows.push(row);
  }

  const values = [categoryRow, labelRow, ...dataRows];

  // Write values
  const updateRes = await fetchFn(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [{ range: "Sheet1!A1", values }],
    }),
  });
  if (!updateRes.ok) {
    const errBody = await updateRes.text();
    throw new Error(`Sheets API batchUpdate failed (${updateRes.status}): ${errBody}`);
  }

  const numCols = 2 + entries.length * 5;
  const formatRes = await fetchFn(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      requests: [
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: numCols },
          },
        },
        ...entries.map((_, ei) => ({
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 2 + ei * 5 + 4, endIndex: 2 + ei * 5 + 5 },
            properties: { pixelSize: 250 },
            fields: "pixelSize",
          },
        })),
      ],
    }),
  });
  if (!formatRes.ok) {
    const errBody = await formatRes.text();
    throw new Error(`Sheets API formatting batchUpdate failed (${formatRes.status}): ${errBody}`);
  }

  return spreadsheetUrl;
}
