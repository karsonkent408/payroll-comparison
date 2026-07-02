import type { StoredResults } from "@/server/db/repos/results";
import type { StoredColumnMapping, Source } from "@/lib/types";

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

// Summary column layout:
//   col 0: __legacy_key__ (hidden)
//   col 1: __new_key__  (hidden)
//   col 2: Employee ID
//   col 3: First Name
//   col 4: Last Name
//   col 5 + ei*5: entry i Legacy
//   col 6 + ei*5: entry i New
//   col 7 + ei*5: entry i Difference
//   col 8 + ei*5: entry i Status
//   col 9 + ei*5: entry i Notes
const SUMMARY_DATA_OFFSET = 5;

export async function sheetsExportDynamic(
  results: StoredResults,
  mapping: StoredColumnMapping,
  comparison: { label: string; pay_period_start: string; pay_period_end: string },
  newSource: Source,
  pairings: { legacy_key: string; new_key: string }[],
  accessToken: string,
  fetchFn: FetchLike = globalThis.fetch
): Promise<string> {
  const entries = orderedEntries(mapping);
  const title = `${comparison.label} - ${comparison.pay_period_start} to ${comparison.pay_period_end}`;

  // Create spreadsheet with three named sheets upfront
  const createRes = await fetchFn(SHEETS_API, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: "Summary" } },
        { properties: { title: "Legacy" } },
        {
          properties: {
            title: "New",
            gridProperties: {
              rowCount: Math.max(1000, newSource.rows.length + 3),
              columnCount: newSource.headers.length + 1,
            },
          },
        },
      ],
    }),
  });
  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Sheets API create failed (${createRes.status}): ${errBody}`);
  }
  const { spreadsheetId, spreadsheetUrl, sheets } = await createRes.json() as {
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets: { properties: { sheetId: number; title: string } }[];
  };
  const summarySheetId = sheets.find((s) => s.properties.title === "Summary")!.properties.sheetId;
  const legacySheetId = sheets.find((s) => s.properties.title === "Legacy")!.properties.sheetId;
  const newSheetId = sheets.find((s) => s.properties.title === "New")!.properties.sheetId;

  // --- Legacy values (RAW) ---
  const legacyHeader = ["Employee ID", ...entries.map((e) => e.label)];
  const legacyRows = results.matched.map((emp) => {
    const row: unknown[] = [emp.employee_key];
    for (const entry of entries) {
      const r = emp.results.find((x) => x.column_entry_id === entry.id);
      row.push(r ? r.legacy_value : "");
    }
    return row;
  });

  // --- New values (RAW) — full Source replica starting at column B; column A is __key__ (USER_ENTERED) ---
  // Row 1: grouping row (section name on first col of each section, empty otherwise)
  // Row 2: column-name row (newSource.headers)
  // Row 3+: data rows
  const newGroupingRow: string[] = [];
  let newPrevSection = "";
  for (const h of newSource.headers) {
    const section = newSource.columnSections[h] ?? "";
    newGroupingRow.push(section !== newPrevSection ? section : "");
    newPrevSection = section;
  }
  const newRawRows = newSource.rows.map((row) =>
    newSource.headers.map((h) => row[h] ?? "")
  );

  const rawUpdateRes = await fetchFn(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [
        { range: "Legacy!A1", values: [legacyHeader, ...legacyRows] },
        { range: "New!B1", values: [newGroupingRow, newSource.headers, ...newRawRows] },
      ],
    }),
  });
  if (!rawUpdateRes.ok) {
    const errBody = await rawUpdateRes.text();
    throw new Error(`Sheets API RAW batchUpdate failed (${rawUpdateRes.status}): ${errBody}`);
  }

  // --- __key__ column formula ---
  // __key__ occupies column A. Row 1 = section header ("__key__"), row 2 = column name ("__key__").
  // Data rows start at row 3, so INDEX/MATCH uses $2:$2 to look up column names.
  const keyFormula = "=" + mapping.new_employee_key
    .map((col) => `INDEX($1:$1048576,ROW(),MATCH(${JSON.stringify(col)},$2:$2,0))`)
    .join('&" "&');
  const newKeyValues: unknown[][] = [
    ["__key__"],  // row 1: section header
    ["__key__"],  // row 2: column name (XLOOKUP in Summary finds __key__ here)
    ...newSource.rows.map(() => [keyFormula]),
  ];

  // --- Summary values (USER_ENTERED) ---
  const summaryHeader1: (string | null)[] = [null, null, null, null, null];
  const summaryHeader2: string[] = ["__legacy_key__", "__new_key__", "Employee ID", "First Name", "Last Name"];
  let prevCategory: string | null = null;

  for (const entry of entries) {
    if (entry.category !== prevCategory) {
      summaryHeader1.push(entry.category);
      prevCategory = entry.category;
    } else {
      summaryHeader1.push(null);
    }
    summaryHeader1.push(null, null, null, null);
    summaryHeader2.push(
      `${entry.label} Legacy`,
      `${entry.label} New`,
      `${entry.label} Difference`,
      `${entry.label} Status`,
      `${entry.label} Notes`
    );
  }

  const summaryDataRows: unknown[][] = [];

  for (let k = 0; k < results.matched.length; k++) {
    const emp = results.matched[k];
    const newKey = pairings.find((p) => p.legacy_key === emp.employee_key)?.new_key ?? emp.employee_key;
    const summaryRow = k + 3; // Summary data row (1-indexed Excel, 2 header rows)
    const newKeyLookup = `XLOOKUP("__key__",New!$2:$2,New!$A:$XFD)`;
    const firstNameF = mapping.new_first_name_column
      ? `=IFERROR(XLOOKUP(TRIM($B${summaryRow}),${newKeyLookup},XLOOKUP(${JSON.stringify(mapping.new_first_name_column)},New!$2:$2,New!$A:$XFD)),"")`
      : "";
    const lastNameF = mapping.new_last_name_column
      ? `=IFERROR(XLOOKUP(TRIM($B${summaryRow}),${newKeyLookup},XLOOKUP(${JSON.stringify(mapping.new_last_name_column)},New!$2:$2,New!$A:$XFD)),"")`
      : "";
    const row: unknown[] = [emp.employee_key, newKey, emp.employee_key, firstNameF, lastNameF];

    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      const result = emp.results.find((r) => r.column_entry_id === entry.id);

      const summaryLegacyCol = colLetter(SUMMARY_DATA_OFFSET + ei * 5);
      const summaryNewCol = colLetter(SUMMARY_DATA_OFFSET + 1 + ei * 5);
      const summaryDiffCol = colLetter(SUMMARY_DATA_OFFSET + 2 + ei * 5);
      const diffRef = `${summaryDiffCol}${summaryRow}`;
      const tol = entry.tolerance;

      // XLOOKUP formulas: look up by employee key (col A = __legacy_key__, col B = __new_key__)
      // and column header name — no bare column letters.
      const legacyLookupArr = `XLOOKUP("Employee ID",Legacy!$1:$1,Legacy!$A:$XFD)`;
      const legacyReturnArr = `XLOOKUP(${JSON.stringify(entry.label)},Legacy!$1:$1,Legacy!$A:$XFD)`;
      const legacyF = `=XLOOKUP(TRIM($A${summaryRow}),${legacyLookupArr},${legacyReturnArr})`;

      const newKeyArr = `XLOOKUP("__key__",New!$2:$2,New!$A:$XFD)`;
      const newF = "=" + entry.new_columns
        .map((col) => `VALUE(XLOOKUP(TRIM($B${summaryRow}),${newKeyArr},XLOOKUP(${JSON.stringify(col)},New!$2:$2,New!$A:$XFD)))`)
        .join("+");

      const diffF = `=${summaryLegacyCol}${summaryRow}-${summaryNewCol}${summaryRow}`;
      const status = result
        ? (result.manual_override
            ? result.manual_override
            : `=IF(AND(${diffRef}>=-${tol},${diffRef}<=${tol}),"resolved","unresolved")`)
        : "";
      const note = result ? (result.note ?? "") : "";

      row.push(legacyF, newF, diffF, status, note);
    }
    summaryDataRows.push(row);
  }

  for (const unmatched of results.unmatched) {
    const row: unknown[] = [unmatched.employee_key, "", unmatched.employee_key, "", ""];
    for (let i = 0; i < entries.length; i++) {
      row.push("", "", "", "", "");
    }
    summaryDataRows.push(row);
  }

  const summaryValues = [summaryHeader1, summaryHeader2, ...summaryDataRows];

  const userEnteredUpdateRes = await fetchFn(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [
        { range: "Summary!A1", values: summaryValues },
        { range: "New!A1", values: newKeyValues },
      ],
    }),
  });
  if (!userEnteredUpdateRes.ok) {
    const errBody = await userEnteredUpdateRes.text();
    throw new Error(`Sheets API USER_ENTERED batchUpdate failed (${userEnteredUpdateRes.status}): ${errBody}`);
  }

  const totalCols = SUMMARY_DATA_OFFSET + entries.length * 5;

  // Compute category spans for merge requests
  const categorySpans: { start: number; end: number }[] = [];
  let spanCategory: string | null = null;
  let spanStart = SUMMARY_DATA_OFFSET;
  for (let ei = 0; ei < entries.length; ei++) {
    const cat = entries[ei].category;
    if (cat !== spanCategory) {
      if (spanCategory !== null) categorySpans.push({ start: spanStart, end: SUMMARY_DATA_OFFSET + ei * 5 });
      spanCategory = cat;
      spanStart = SUMMARY_DATA_OFFSET + ei * 5;
    }
  }
  if (spanCategory !== null) categorySpans.push({ start: spanStart, end: totalCols });

  const totalDataRows = 2 + results.matched.length + results.unmatched.length;

  const requests: unknown[] = [
    {
      updateSheetProperties: {
        properties: { sheetId: summarySheetId, gridProperties: { frozenRowCount: 2, frozenColumnCount: 5 } },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    },
    ...categorySpans.map((span) => ({
      mergeCells: {
        range: { sheetId: summarySheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: span.start, endColumnIndex: span.end },
        mergeType: "MERGE_ALL",
      },
    })),
    {
      repeatCell: {
        range: { sheetId: summarySheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalCols },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 126 / 255, green: 34 / 255, blue: 206 / 255 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      repeatCell: {
        range: { sheetId: summarySheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: totalCols },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    },
    ...entries.map((entry, ei) => ({
      repeatCell: {
        range: { sheetId: summarySheetId, startRowIndex: 2, endRowIndex: totalDataRows, startColumnIndex: SUMMARY_DATA_OFFSET + ei * 5, endColumnIndex: SUMMARY_DATA_OFFSET + 3 + ei * 5 },
        cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: entry.category === "Hours" ? "#,##0.00" : "$#,##0.00" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    })),
    ...entries.map((entry, ei) => {
      const diffColIdx = SUMMARY_DATA_OFFSET + 2 + ei * 5;
      const diffCellRef = `${colLetter(diffColIdx)}3`;
      const tol = entry.tolerance;
      return {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: summarySheetId, startRowIndex: 2, endRowIndex: totalDataRows, startColumnIndex: diffColIdx, endColumnIndex: diffColIdx + 1 }],
            booleanRule: {
              condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: `=OR(${diffCellRef}<-${tol},${diffCellRef}>${tol})` }] },
              format: { textFormat: { foregroundColor: { red: 220 / 255, green: 38 / 255, blue: 38 / 255 } } },
            },
          },
          index: 0,
        },
      };
    }),
    ...entries.map((_, ei) => {
      const notesColIdx = SUMMARY_DATA_OFFSET + 4 + ei * 5;
      return {
        updateBorders: {
          range: { sheetId: summarySheetId, startRowIndex: 0, endRowIndex: totalDataRows, startColumnIndex: notesColIdx, endColumnIndex: notesColIdx + 1 },
          right: { style: "SOLID_THICK", color: { red: 0, green: 0, blue: 0 } },
        },
      };
    }),
    ...entries.flatMap((_, ei) => {
      const statusColIdx = SUMMARY_DATA_OFFSET + 3 + ei * 5;
      const statusCellRef = `${colLetter(statusColIdx)}3`;
      const range = { sheetId: summarySheetId, startRowIndex: 2, endRowIndex: totalDataRows, startColumnIndex: statusColIdx, endColumnIndex: statusColIdx + 1 };
      return [
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [range],
              booleanRule: {
                condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: `=${statusCellRef}="unresolved"` }] },
                format: { backgroundColor: { red: 220 / 255, green: 38 / 255, blue: 38 / 255 } },
              },
            },
            index: 0,
          },
        },
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [range],
              booleanRule: {
                condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: `=${statusCellRef}="resolved"` }] },
                format: { backgroundColor: { red: 22 / 255, green: 163 / 255, blue: 74 / 255 } },
              },
            },
            index: 0,
          },
        },
      ];
    }),
    // Hide Summary columns A (__legacy_key__) and B (__new_key__)
    {
      updateDimensionProperties: {
        range: { sheetId: summarySheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 2 },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      },
    },
  ];

  for (let ei = 0; ei < entries.length; ei++) {
    const statusColIdx = SUMMARY_DATA_OFFSET + 3 + ei * 5;
    requests.push({
      setDataValidation: {
        range: { sheetId: summarySheetId, startRowIndex: 2, endRowIndex: totalDataRows, startColumnIndex: statusColIdx, endColumnIndex: statusColIdx + 1 },
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: [{ userEnteredValue: "resolved" }, { userEnteredValue: "unresolved" }],
          },
          strict: true,
          showCustomUi: true,
        },
      },
    });
  }

  requests.push(
    {
      autoResizeDimensions: {
        dimensions: { sheetId: summarySheetId, dimension: "COLUMNS", startIndex: 0, endIndex: totalCols },
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId: legacySheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 + entries.length },
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 + newSource.headers.length },
      },
    },
    ...entries.map((_, ei) => ({
      updateDimensionProperties: {
        range: { sheetId: summarySheetId, dimension: "COLUMNS", startIndex: SUMMARY_DATA_OFFSET + 4 + ei * 5, endIndex: SUMMARY_DATA_OFFSET + 5 + ei * 5 },
        properties: { pixelSize: 250 },
        fields: "pixelSize",
      },
    })),
  );

  requests.push({
    addBanding: {
      bandedRange: {
        range: { sheetId: summarySheetId, startRowIndex: 2, endRowIndex: totalDataRows },
        rowProperties: {
          firstBandColor: { red: 1, green: 1, blue: 1 },
          secondBandColor: { red: 243 / 255, green: 244 / 255, blue: 246 / 255 },
        },
      },
    },
  });

  const formattingRes = await fetchFn(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ requests }),
  });
  if (!formattingRes.ok) {
    const errBody = await formattingRes.text();
    throw new Error(`Sheets API formatting batchUpdate failed (${formattingRes.status}): ${errBody}`);
  }

  return spreadsheetUrl;
}

function colLetter(idx: number): string {
  let result = "";
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
