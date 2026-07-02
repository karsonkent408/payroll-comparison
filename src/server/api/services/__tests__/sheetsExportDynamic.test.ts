import { test, expect, describe } from "bun:test";
import { sheetsExportDynamic } from "@/server/api/services/sheetsExportDynamic";
import type { StoredResults } from "@/server/db/repos/results";
import type { StoredColumnMapping, Source } from "@/lib/types";

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
          new_value: 950,
          new_breakdown: null,
          difference: 50,
          tolerance: 0.01,
          auto_status: "unresolved",
          manual_override: "resolved",
          note: "rounding",
        },
      ],
    },
  ],
  unmatched: [],
};

const baseComparison = { label: "Jan 2024", pay_period_start: "2024-01-01", pay_period_end: "2024-01-31" };

const baseNewSource: Source = {
  id: 1,
  comparison_id: 1,
  type: "new",
  file_name: "new.csv",
  uploaded_at: "2024-01-01",
  headers: ["employee_id", "gross_pay"],
  rows: [{ employee_id: "101", gross_pay: "950" }],
  row_count: 1,
  detectedTypes: { employee_id: "string", gross_pay: "number" },
  columnSections: {},
  legacy_provider: null,
  format_notes: null,
};

const basePairings = [{ legacy_key: "101", new_key: "101" }];

const noOverrideResults: StoredResults = {
  matched: [
    {
      employee_key: "101",
      employee_name: "Alice Smith",
      results: [{ ...baseResults.matched[0].results[0], manual_override: null, auto_status: "unresolved" }],
    },
  ],
  unmatched: [],
};

type Call = { url: string; init: RequestInit };

function makeMockFetch(spreadsheetUrl = "https://docs.google.com/spreadsheets/d/abc123") {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (url.includes("/values:batchUpdate")) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (url.includes(":batchUpdate")) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        spreadsheetId: "abc123",
        spreadsheetUrl,
        sheets: [
          { properties: { sheetId: 1, title: "Legacy" } },
          { properties: { sheetId: 2, title: "New" } },
          { properties: { sheetId: 42, title: "Summary" } },
        ],
      }),
      { status: 200 }
    );
  };
  return { fetchFn, calls };
}

function formattingCall(calls: Call[]): Call | undefined {
  return calls.find((c) => c.url.includes(":batchUpdate") && !c.url.includes("/values:batchUpdate"));
}

function parsedBody<T>(call: Call): T {
  return JSON.parse(String(call.init.body));
}

function summaryUserEnteredValues(calls: Call[]): any[][] {
  const userEnteredCall = calls.find((c) => {
    if (!c.url.includes("/values:batchUpdate")) return false;
    return parsedBody<{ valueInputOption: string }>(c).valueInputOption === "USER_ENTERED";
  })!;
  const body = parsedBody<{ data: { range: string; values: any[][] }[] }>(userEnteredCall);
  return body.data.find((d) => d.range.startsWith("Summary!"))!.values;
}

describe("sheetsExportDynamic", () => {
  test("returns the spreadsheet URL on success", async () => {
    const { fetchFn } = makeMockFetch("https://docs.google.com/spreadsheets/d/abc123");
    const url = await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    expect(url).toBe("https://docs.google.com/spreadsheets/d/abc123");
  });

  test("UnmatchedEmployees appear in Summary payload only — absent from Legacy and New payloads", async () => {
    const results: StoredResults = {
      matched: [{ ...baseResults.matched[0] }],
      unmatched: [{ id: "1", employee_key: "999", employee_name: null, source_type: "legacy", resolved: false, note: null }],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(results, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);

    const rawCall = calls.find((c) => {
      if (!c.url.includes("/values:batchUpdate")) return false;
      return parsedBody<{ valueInputOption: string }>(c).valueInputOption === "RAW";
    });
    const rawBody = parsedBody<{ data: { range: string; values: unknown[][] }[] }>(rawCall!);
    const legacyValues = rawBody.data.find((d) => d.range.startsWith("Legacy!"))!.values;
    const newValues = rawBody.data.find((d) => d.range.startsWith("New!"))!.values;
    // Legacy: header + 1 matched employee
    expect(legacyValues).toHaveLength(2);
    // New: grouping row + column-name row + 1 data row (from newSource which has 1 row)
    expect(newValues).toHaveLength(3);

    const summaryValues = summaryUserEnteredValues(calls);
    // Summary: category header + entry labels + matched employee + unmatched employee
    expect(summaryValues).toHaveLength(4);
    expect(summaryValues[3][0]).toBe("999");
  });

  test("Summary DiscrepancyStatus and Notes cells are plain strings — manual_override takes precedence", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    // col 8=Status, col 9=Notes; baseResults has manual_override='resolved', note='rounding'
    expect(dataRow[8]).toBe("resolved");
    expect(dataRow[9]).toBe("rounding");
    expect(String(dataRow[8])).not.toMatch(/^=/);
    expect(String(dataRow[9])).not.toMatch(/^=/);
  });

  test("Status cell for matched row with no manual override is a formula string starting with '='", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(noOverrideResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    // col 8 = Status for first entry
    expect(dataRow[8]).toMatch(/^=/);
  });

  test("Status formula hardcodes the entry Tolerance as a numeric literal", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(noOverrideResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    // baseMapping entry has tolerance 0.01
    expect(dataRow[8]).toContain("0.01");
  });

  test("Multiple entries with different Tolerance values produce different Tolerance literals in their Status formulas", async () => {
    const twoEntryMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], id: "1", tolerance: 0.01, label: "Gross" },
        { ...baseMapping.entries[0], id: "2", tolerance: 5, label: "Tax", new_columns: ["tax"], legacy_columns: ["tax_legacy"] },
      ],
    };
    const twoEntryResults: StoredResults = {
      matched: [{
        employee_key: "101",
        employee_name: "Alice Smith",
        results: [
          { ...baseResults.matched[0].results[0], column_entry_id: "1", manual_override: null },
          { ...baseResults.matched[0].results[0], id: 2, column_entry_id: "2", tolerance: 5, manual_override: null, new_columns: ["tax"], legacy_columns: ["tax_legacy"] },
        ],
      }],
      unmatched: [],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(twoEntryResults, twoEntryMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    // Entry 0: Status at col 8; Entry 1: Status at col 13
    const status1 = dataRow[8];
    const status2 = dataRow[13];
    expect(status1).toContain("0.01");
    expect(status2).toContain("5");
    expect(status1).not.toEqual(status2);
  });

  test("Summary Difference cells are intra-sheet formulas — no cross-sheet references", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    // col 7 = Difference for first entry
    const diffCell = dataRow[7];
    expect(typeof diffCell).toBe("string");
    expect(diffCell).toMatch(/^=/);
    expect(diffCell).not.toMatch(/Legacy!/);
    expect(diffCell).not.toMatch(/New!/);
  });

  test("Summary payload contains XLOOKUP formula strings referencing Legacy! and New! for value cells", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    expect(dataRow.some((cell) => typeof cell === "string" && cell.includes("XLOOKUP") && cell.includes("Legacy!"))).toBe(true);
    expect(dataRow.some((cell) => typeof cell === "string" && cell.includes("XLOOKUP") && cell.includes("New!"))).toBe(true);
  });

  test("Summary sheet data is written with USER_ENTERED valueInputOption", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const updateCalls = calls.filter((c) => c.url.includes("/values:batchUpdate"));
    const userEnteredCall = updateCalls.find((c) => {
      const body = parsedBody<{ valueInputOption: string }>(c);
      return body.valueInputOption === "USER_ENTERED";
    });
    expect(userEnteredCall).toBeDefined();
    const body = parsedBody<{ data: { range: string }[] }>(userEnteredCall!);
    const ranges = body.data.map((d) => d.range);
    expect(ranges.some((r) => r.startsWith("Summary!"))).toBe(true);
  });

  test("Legacy and New sheet data is written with RAW valueInputOption", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const updateCalls = calls.filter((c) => c.url.includes("/values:batchUpdate"));
    const rawCall = updateCalls.find((c) => {
      const body = parsedBody<{ valueInputOption: string }>(c);
      return body.valueInputOption === "RAW";
    });
    expect(rawCall).toBeDefined();
    const body = parsedBody<{ data: { range: string }[] }>(rawCall!);
    const ranges = body.data.map((d) => d.range);
    expect(ranges.some((r) => r.startsWith("Legacy!"))).toBe(true);
    expect(ranges.some((r) => r.startsWith("New!"))).toBe(true);
  });

  test("create call includes three sheets named Legacy, New, Summary", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const createCall = calls.find((c) => !c.url.includes("/batchUpdate"));
    const body = parsedBody<{ sheets: { properties: { title: string } }[] }>(createCall!);
    const sheetTitles = body.sheets.map((s) => s.properties.title);
    expect(sheetTitles).toEqual(["Summary", "Legacy", "New"]);
  });

  test("a formatting batchUpdate call is made after the value-write calls", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    expect(formattingCall(calls)).toBeDefined();
  });

  test("formatting call contains one mergeCells request per ComparisonCategory span", async () => {
    const twoCategories: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], id: "1", category: "Earnings", display_order: 0, label: "Gross" },
        { ...baseMapping.entries[0], id: "2", category: "Earnings", display_order: 1, label: "Net Earn" },
        { ...baseMapping.entries[0], id: "3", category: "Taxes", display_order: 0, label: "Fed Tax" },
      ],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, twoCategories, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    const body = parsedBody<{ requests: { mergeCells?: { range: { startColumnIndex: number; endColumnIndex: number } } }[] }>(fc);
    const merges = body.requests.filter((r) => r.mergeCells).map((r) => r.mergeCells!.range);
    // Earnings: 2 entries × 5 cols = cols 5–14; Taxes: 1 entry × 5 cols = cols 15–19
    expect(merges).toHaveLength(2);
    expect(merges[0]).toMatchObject({ startColumnIndex: 5, endColumnIndex: 15 });
    expect(merges[1]).toMatchObject({ startColumnIndex: 15, endColumnIndex: 20 });
  });

  test("category header repeatCell request covers row 0 with purple background, white text, and bold", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type RepeatCellReq = {
      repeatCell?: {
        range: { startRowIndex: number; endRowIndex: number };
        cell: { userEnteredFormat: { backgroundColor: { red: number; green: number; blue: number }; textFormat: { foregroundColor: { red: number; green: number; blue: number }; bold: boolean } } };
      };
    };
    const body = parsedBody<{ requests: RepeatCellReq[] }>(fc);
    const headerRepeat = body.requests.find(
      (r) => r.repeatCell?.range.startRowIndex === 0 && r.repeatCell?.range.endRowIndex === 1
    )?.repeatCell!;
    expect(headerRepeat).toBeDefined();
    const { backgroundColor, textFormat } = headerRepeat.cell.userEnteredFormat;
    // #7E22CE = RGB(126, 34, 206)
    expect(backgroundColor.red).toBeCloseTo(126 / 255, 3);
    expect(backgroundColor.green).toBeCloseTo(34 / 255, 3);
    expect(backgroundColor.blue).toBeCloseTo(206 / 255, 3);
    expect(textFormat.foregroundColor).toMatchObject({ red: 1, green: 1, blue: 1 });
    expect(textFormat.bold).toBe(true);
  });

  test("entry label row has a bold repeatCell request covering row 1", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type RepeatCellReq = { repeatCell?: { range: { startRowIndex: number; endRowIndex: number }; cell: { userEnteredFormat: { textFormat: { bold: boolean } } } } };
    const body = parsedBody<{ requests: RepeatCellReq[] }>(fc);
    const labelRepeat = body.requests.find(
      (r) => r.repeatCell?.range.startRowIndex === 1 && r.repeatCell?.range.endRowIndex === 2
    )?.repeatCell!;
    expect(labelRepeat).toBeDefined();
    expect(labelRepeat.cell.userEnteredFormat.textFormat.bold).toBe(true);
  });

  test("non-Hours MappingEntry value columns get currency number format in data rows", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    // baseMapping has one Earnings entry at index 0: Legacy=col5, New=col6, Diff=col7
    const fc = formattingCall(calls)!;
    type Req = { repeatCell?: { range: { startRowIndex: number; startColumnIndex: number; endColumnIndex: number }; cell: { userEnteredFormat: { numberFormat: { pattern: string } } } } };
    const body = parsedBody<{ requests: Req[] }>(fc);
    const fmtReq = body.requests.find(
      (r) => r.repeatCell?.range.startRowIndex === 2 && r.repeatCell?.range.startColumnIndex === 5 && r.repeatCell?.range.endColumnIndex === 8
    )?.repeatCell!;
    expect(fmtReq).toBeDefined();
    expect(fmtReq.cell.userEnteredFormat.numberFormat.pattern).toBe("$#,##0.00");
  });

  test("Hours MappingEntry value columns get plain number format, not currency", async () => {
    const hoursMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], id: "1", category: "Hours", label: "Reg Hours" },
        { ...baseMapping.entries[0], id: "2", category: "Earnings", label: "Gross" },
      ],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, hoursMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type Req = { repeatCell?: { range: { startColumnIndex: number }; cell: { userEnteredFormat: { numberFormat: { pattern: string } } } } };
    const body = parsedBody<{ requests: Req[] }>(fc);
    const fmtReqs = body.requests.filter((r) => r.repeatCell?.cell.userEnteredFormat.numberFormat);
    // entry 0 = Hours (col5–7), entry 1 = Earnings (col10–12)
    const hoursReq = fmtReqs.find((r) => r.repeatCell!.range.startColumnIndex === 5)?.repeatCell!;
    const earningsReq = fmtReqs.find((r) => r.repeatCell!.range.startColumnIndex === 10)?.repeatCell!;
    expect(hoursReq.cell.userEnteredFormat.numberFormat.pattern).toBe("#,##0.00");
    expect(earningsReq.cell.userEnteredFormat.numberFormat.pattern).toBe("$#,##0.00");
  });

  test("one addConditionalFormatRule request exists per MappingEntry targeting its Difference column", async () => {
    const twoEntryMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], id: "1", label: "Gross", tolerance: 0.01 },
        { ...baseMapping.entries[0], id: "2", label: "Tax", tolerance: 5 },
      ],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, twoEntryMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type CFReq = { addConditionalFormatRule?: { rule: { ranges: { startColumnIndex: number }[] } } };
    const body = parsedBody<{ requests: CFReq[] }>(fc);
    const cfRules = body.requests.filter((r) => r.addConditionalFormatRule);
    // Difference col for entry 0 = col 7; entry 1 = col 12
    expect(cfRules.some((r) => r.addConditionalFormatRule!.rule.ranges[0].startColumnIndex === 7)).toBe(true);
    expect(cfRules.some((r) => r.addConditionalFormatRule!.rule.ranges[0].startColumnIndex === 12)).toBe(true);
  });

  test("Difference column CF formula contains the entry Tolerance as a hard-coded literal", async () => {
    const twoEntryMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], id: "1", label: "Gross", tolerance: 0.01 },
        { ...baseMapping.entries[0], id: "2", label: "Tax", tolerance: 5 },
      ],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, twoEntryMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type CFReq = { addConditionalFormatRule?: { rule: { ranges: { startColumnIndex: number }[]; booleanRule: { condition: { values: { userEnteredValue: string }[] } } } } };
    const body = parsedBody<{ requests: CFReq[] }>(fc);
    const cfRules = body.requests.filter((r) => r.addConditionalFormatRule).map((r) => r.addConditionalFormatRule!);
    const rule0 = cfRules.find((r) => r.rule.ranges[0].startColumnIndex === 7)!;
    const rule1 = cfRules.find((r) => r.rule.ranges[0].startColumnIndex === 12)!;
    expect(rule0.rule.booleanRule.condition.values[0].userEnteredValue).toContain("0.01");
    expect(rule1.rule.booleanRule.condition.values[0].userEnteredValue).toContain("5");
  });

  test("Difference column CF rule applies red text (#DC2626) for out-of-tolerance values", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type CFReq = { addConditionalFormatRule?: { rule: { ranges: { startColumnIndex: number }[]; booleanRule: { format: { textFormat: { foregroundColor: { red: number; green: number; blue: number } } } } } } };
    const body = parsedBody<{ requests: CFReq[] }>(fc);
    const diffRule = body.requests
      .filter((r) => r.addConditionalFormatRule)
      .find((r) => r.addConditionalFormatRule!.rule.ranges[0].startColumnIndex === 7)!
      .addConditionalFormatRule!;
    const { red, green, blue } = diffRule.rule.booleanRule.format.textFormat.foregroundColor;
    // #DC2626 = RGB(220, 38, 38)
    expect(red).toBeCloseTo(220 / 255, 3);
    expect(green).toBeCloseTo(38 / 255, 3);
    expect(blue).toBeCloseTo(38 / 255, 3);
  });

  test("two addConditionalFormatRule requests exist per MappingEntry targeting its Status column", async () => {
    const twoEntryMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], id: "1", label: "Gross" },
        { ...baseMapping.entries[0], id: "2", label: "Tax" },
      ],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, twoEntryMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type CFReq = { addConditionalFormatRule?: { rule: { ranges: { startColumnIndex: number }[] } } };
    const body = parsedBody<{ requests: CFReq[] }>(fc);
    // Status col for entry 0 = col 8; entry 1 = col 13
    const rulesOnCol8 = body.requests.filter((r) => r.addConditionalFormatRule?.rule.ranges[0].startColumnIndex === 8);
    const rulesOnCol13 = body.requests.filter((r) => r.addConditionalFormatRule?.rule.ranges[0].startColumnIndex === 13);
    expect(rulesOnCol8).toHaveLength(2);
    expect(rulesOnCol13).toHaveLength(2);
  });

  test("Status column CF rule for unresolved applies red background (#DC2626)", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type CFReq = { addConditionalFormatRule?: { rule: { ranges: { startColumnIndex: number }[]; booleanRule: { condition: { values: { userEnteredValue: string }[] }; format: { backgroundColor: { red: number; green: number; blue: number } } } } } };
    const body = parsedBody<{ requests: CFReq[] }>(fc);
    const unresolvedRule = body.requests
      .filter((r) => r.addConditionalFormatRule?.rule.ranges[0].startColumnIndex === 8)
      .find((r) => r.addConditionalFormatRule!.rule.booleanRule.condition.values[0].userEnteredValue.includes("unresolved"))!
      .addConditionalFormatRule!;
    const { red, green, blue } = unresolvedRule.rule.booleanRule.format.backgroundColor;
    expect(red).toBeCloseTo(220 / 255, 3);
    expect(green).toBeCloseTo(38 / 255, 3);
    expect(blue).toBeCloseTo(38 / 255, 3);
  });

  test("Status column CF rule for resolved applies green background (#16A34A)", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type CFReq = { addConditionalFormatRule?: { rule: { ranges: { startColumnIndex: number }[]; booleanRule: { condition: { values: { userEnteredValue: string }[] }; format: { backgroundColor: { red: number; green: number; blue: number } } } } } };
    const body = parsedBody<{ requests: CFReq[] }>(fc);
    const resolvedRule = body.requests
      .filter((r) => r.addConditionalFormatRule?.rule.ranges[0].startColumnIndex === 8)
      .find((r) => r.addConditionalFormatRule!.rule.booleanRule.condition.values[0].userEnteredValue.includes("resolved") && !r.addConditionalFormatRule!.rule.booleanRule.condition.values[0].userEnteredValue.includes("unresolved"))!
      .addConditionalFormatRule!;
    const { red, green, blue } = resolvedRule.rule.booleanRule.format.backgroundColor;
    expect(red).toBeCloseTo(22 / 255, 3);
    expect(green).toBeCloseTo(163 / 255, 3);
    expect(blue).toBeCloseTo(74 / 255, 3);
  });

  test("one updateBorders request per MappingEntry places a thick right border on the Notes column", async () => {
    const twoEntryMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], id: "1", label: "Gross" },
        { ...baseMapping.entries[0], id: "2", label: "Tax" },
      ],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, twoEntryMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type BorderReq = { updateBorders?: { range: { startColumnIndex: number; endColumnIndex: number }; right: { style: string } } };
    const body = parsedBody<{ requests: BorderReq[] }>(fc);
    // Notes col for entry 0 = col 9; entry 1 = col 14
    const border0 = body.requests.find((r) => r.updateBorders?.range.startColumnIndex === 9)?.updateBorders!;
    const border1 = body.requests.find((r) => r.updateBorders?.range.startColumnIndex === 14)?.updateBorders!;
    expect(border0).toBeDefined();
    expect(border0.right.style).toBe("SOLID_THICK");
    expect(border1).toBeDefined();
    expect(border1.right.style).toBe("SOLID_THICK");
  });

  test("MappingEntry border spans full sheet height including header rows", async () => {
    const resultsWithUnmatched: StoredResults = {
      matched: baseResults.matched,
      unmatched: [{ id: "1", employee_key: "999", employee_name: null, source_type: "legacy", resolved: false, note: null }],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(resultsWithUnmatched, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type BorderReq = { updateBorders?: { range: { startRowIndex: number; endRowIndex: number; startColumnIndex: number } } };
    const body = parsedBody<{ requests: BorderReq[] }>(fc);
    const border = body.requests.find((r) => r.updateBorders?.range.startColumnIndex === 9)?.updateBorders!;
    // 2 header rows + 1 matched + 1 unmatched = 4 total rows
    expect(border.range.startRowIndex).toBe(0);
    expect(border.range.endRowIndex).toBe(4);
  });

  test("one addBanding request covers all data rows with white and light-grey alternating colors", async () => {
    const resultsWithUnmatched: StoredResults = {
      matched: baseResults.matched,
      unmatched: [{ id: "1", employee_key: "999", employee_name: null, source_type: "legacy", resolved: false, note: null }],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(resultsWithUnmatched, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type BandingReq = { addBanding?: { bandedRange: { range: { startRowIndex: number; endRowIndex: number }; rowProperties: { firstBandColor: { red: number; green: number; blue: number }; secondBandColor: { red: number; green: number; blue: number } } } } };
    const body = parsedBody<{ requests: BandingReq[] }>(fc);
    const banding = body.requests.find((r) => r.addBanding)?.addBanding!;
    expect(banding).toBeDefined();
    // Data rows: startRowIndex 2, endRowIndex 4 (2 header + 1 matched + 1 unmatched)
    expect(banding.bandedRange.range.startRowIndex).toBe(2);
    expect(banding.bandedRange.range.endRowIndex).toBe(4);
    // First band: white
    expect(banding.bandedRange.rowProperties.firstBandColor).toMatchObject({ red: 1, green: 1, blue: 1 });
    // Second band: #F3F4F6 = RGB(243,244,246)
    expect(banding.bandedRange.rowProperties.secondBandColor.red).toBeCloseTo(243 / 255, 3);
    expect(banding.bandedRange.rowProperties.secondBandColor.green).toBeCloseTo(244 / 255, 3);
    expect(banding.bandedRange.rowProperties.secondBandColor.blue).toBeCloseTo(246 / 255, 3);
  });

  test("one setDataValidation request per MappingEntry targets its Status column in data rows", async () => {
    const twoEntryMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], id: "1", label: "Gross" },
        { ...baseMapping.entries[0], id: "2", label: "Tax" },
      ],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, twoEntryMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type DVReq = { setDataValidation?: { range: { startRowIndex: number; startColumnIndex: number } } };
    const body = parsedBody<{ requests: DVReq[] }>(fc);
    // Status col for entry 0 = col 8; entry 1 = col 13
    const dv0 = body.requests.find((r) => r.setDataValidation?.range.startColumnIndex === 8)?.setDataValidation!;
    const dv1 = body.requests.find((r) => r.setDataValidation?.range.startColumnIndex === 13)?.setDataValidation!;
    expect(dv0).toBeDefined();
    expect(dv0.range.startRowIndex).toBe(2);
    expect(dv1).toBeDefined();
    expect(dv1.range.startRowIndex).toBe(2);
  });

  test("Status column data validation rule is strict", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type DVReq = { setDataValidation?: { range: { startColumnIndex: number }; rule: { strict: boolean } } };
    const body = parsedBody<{ requests: DVReq[] }>(fc);
    const dv = body.requests.find((r) => r.setDataValidation?.range.startColumnIndex === 8)?.setDataValidation!;
    expect(dv.rule.strict).toBe(true);
  });

  test("Status column data validation is ONE_OF_LIST with resolved and unresolved", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type DVReq = { setDataValidation?: { range: { startColumnIndex: number }; rule: { condition: { type: string; values: { userEnteredValue: string }[] } } } };
    const body = parsedBody<{ requests: DVReq[] }>(fc);
    const dv = body.requests.find((r) => r.setDataValidation?.range.startColumnIndex === 8)?.setDataValidation!;
    expect(dv.rule.condition.type).toBe("ONE_OF_LIST");
    const listValues = dv.rule.condition.values.map((v) => v.userEnteredValue);
    expect(listValues).toContain("resolved");
    expect(listValues).toContain("unresolved");
    expect(listValues).toHaveLength(2);
  });

  test("Summary sheet has first 2 rows and 4 columns frozen", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type SheetPropReq = { updateSheetProperties?: { properties: { sheetId: number; gridProperties: { frozenRowCount: number; frozenColumnCount: number } } } };
    const body = parsedBody<{ requests: SheetPropReq[] }>(fc);
    const req = body.requests.find((r) => r.updateSheetProperties)?.updateSheetProperties!;
    expect(req).toBeDefined();
    expect(req.properties.sheetId).toBe(42);
    expect(req.properties.gridProperties.frozenRowCount).toBe(2);
    expect(req.properties.gridProperties.frozenColumnCount).toBe(5);
  });

  test("formatting requests reference the Summary sheet ID returned by the create response", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    const body = parsedBody<{ requests: { repeatCell?: { range: { sheetId: number } } }[] }>(fc);
    const sheetIds = body.requests.flatMap((r) =>
      r.repeatCell ? [r.repeatCell.range.sheetId] : []
    );
    expect(sheetIds.every((id) => id === 42)).toBe(true);
    expect(sheetIds.length).toBeGreaterThan(0);
  });

  // --- New tests for New replica + XLOOKUP ---

  test("New RAW write payload has grouping row then Source.headers, starting at New!B1", async () => {
    const newSourceWithSections: Source = {
      ...baseNewSource,
      headers: ["employee_id", "gross_pay"],
      columnSections: { employee_id: "Employee", gross_pay: "Earnings" },
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, newSourceWithSections, basePairings, "tok", fetchFn);
    const rawCall = calls.find((c) => {
      if (!c.url.includes("/values:batchUpdate")) return false;
      return parsedBody<{ valueInputOption: string }>(c).valueInputOption === "RAW";
    })!;
    const body = parsedBody<{ data: { range: string; values: unknown[][] }[] }>(rawCall);
    const newData = body.data.find((d) => d.range.startsWith("New!"))!;
    expect(newData.range).toBe("New!B1");
    // Row 1: grouping row — section name on first col of each section, empty otherwise
    expect(newData.values[0]).toEqual(["Employee", "Earnings"]);
    // Row 2: column names
    expect(newData.values[1]).toEqual(newSourceWithSections.headers);
  });

  test("__key__ column is written USER_ENTERED at New!A1 with section header, column name, then INDEX/MATCH formula", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const userEnteredCall = calls.find((c) => {
      if (!c.url.includes("/values:batchUpdate")) return false;
      return parsedBody<{ valueInputOption: string }>(c).valueInputOption === "USER_ENTERED";
    })!;
    const body = parsedBody<{ data: { range: string; values: any[][] }[] }>(userEnteredCall);
    const newKeyData = body.data.find((d) => d.range === "New!A1")!;
    expect(newKeyData).toBeDefined();
    // Row 1: section header; row 2: column name; row 3+: data formulas
    expect(newKeyData.values[0][0]).toBe("__key__");
    expect(newKeyData.values[1][0]).toBe("__key__");
    const formula = newKeyData.values[2][0];
    expect(formula).toContain("INDEX");
    expect(formula).toContain("MATCH");
    // Uses $2:$2 to find column names in the column-name row (row 2)
    expect(formula).toContain("$2:$2");
    expect(formula).toContain("employee_id");
  });

  test("Summary USER_ENTERED payload has __legacy_key__ and __new_key__ as first two header values", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const labelRow = summaryValues[1];
    expect(labelRow[0]).toBe("__legacy_key__");
    expect(labelRow[1]).toBe("__new_key__");
    expect(labelRow[3]).toBe("First Name");
    expect(labelRow[4]).toBe("Last Name");
  });

  test("Summary data rows write legacy key in col A and new key (from EmployeePairing) in col B", async () => {
    const pairingsWithDiff = [{ legacy_key: "101", new_key: "EMP-101" }];
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, pairingsWithDiff, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    expect(dataRow[0]).toBe("101");       // legacy key
    expect(dataRow[1]).toBe("EMP-101");   // new key from pairing
  });

  test("Summary Legacy formula contains XLOOKUP and references Legacy! by column header name", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    // col 5 = Legacy value for first entry
    const legacyFormula = dataRow[5];
    expect(legacyFormula).toContain("XLOOKUP");
    expect(legacyFormula).toContain("Legacy!");
    // TRIM coerces to string and strips whitespace (prevents number/string mismatch with RAW-written source)
    expect(legacyFormula).toContain("TRIM($A3)");
    // References the ColumnEntry label by name, not a bare column letter
    expect(legacyFormula).toContain(JSON.stringify(baseMapping.entries[0].label));
  });

  test("Summary New formula contains XLOOKUP and references New! via __key__ column", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    // col 6 = New value for first entry
    const newFormula = dataRow[6];
    expect(newFormula).toContain("XLOOKUP");
    expect(newFormula).toContain("New!");
    expect(newFormula).toContain("__key__");
    expect(newFormula).toContain("TRIM($B3)");
    // VALUE() coerces RAW-written string source data to number so currency formatting applies
    expect(newFormula).toContain("VALUE(");
    // Uses $2:$2 to look up column names in the New column-name row (row 2)
    expect(newFormula).toContain("New!$2:$2");
    // References the raw New column name, not a bare column letter
    expect(newFormula).toContain(JSON.stringify(baseMapping.entries[0].new_columns[0]));
  });

  test("multi-column ColumnEntry New formula sums one XLOOKUP term per raw New column", async () => {
    const multiColMapping: StoredColumnMapping = {
      ...baseMapping,
      entries: [
        { ...baseMapping.entries[0], new_columns: ["gross_pay", "bonus"] },
      ],
    };
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, multiColMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const summaryValues = summaryUserEnteredValues(calls);
    const dataRow = summaryValues[2];
    const newFormula = dataRow[6];
    // One XLOOKUP term per column: "gross_pay" and "bonus"
    expect(newFormula.split("XLOOKUP").length - 1).toBeGreaterThanOrEqual(3); // at least: $B lookup + __key__ + gross_pay + bonus
    expect(newFormula).toContain("gross_pay");
    expect(newFormula).toContain("bonus");
  });

  test("formatting batch contains updateDimensionProperties requests hiding Summary columns A and B", async () => {
    const { fetchFn, calls } = makeMockFetch();
    await sheetsExportDynamic(baseResults, baseMapping, baseComparison, baseNewSource, basePairings, "tok", fetchFn);
    const fc = formattingCall(calls)!;
    type DimReq = { updateDimensionProperties?: { range: { sheetId: number; dimension: string; startIndex: number; endIndex: number }; properties: { hiddenByUser: boolean } } };
    const body = parsedBody<{ requests: DimReq[] }>(fc);
    const dimReqs = body.requests.filter((r) => r.updateDimensionProperties);
    const summaryHide = dimReqs.find(
      (r) => r.updateDimensionProperties!.range.sheetId === 42 &&
             r.updateDimensionProperties!.range.dimension === "COLUMNS" &&
             r.updateDimensionProperties!.range.startIndex === 0 &&
             r.updateDimensionProperties!.range.endIndex === 2
    )?.updateDimensionProperties!;
    expect(summaryHide).toBeDefined();
    expect(summaryHide.properties.hiddenByUser).toBe(true);
  });

});
