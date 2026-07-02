import { test, expect, describe } from "bun:test";
import { suggestLegacyColumns } from "@/server/api/services/aiMapper";
import type Anthropic from "@anthropic-ai/sdk";

type AnthropicClient = InstanceType<typeof Anthropic>;

function makeClient(text: string): AnthropicClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text }],
      }),
    },
  } as unknown as AnthropicClient;
}

const NEW_HEADERS = [
  "Earnings Regular",
  "Earnings Overtime",
  "Employee taxes Social Security",
];

const EXISTING_ENTRIES = [
  { new_columns: ["Earnings Regular"], label: "Regular Earnings", category: "Earnings" },
  { new_columns: ["Earnings Overtime"], label: "Overtime Earnings", category: "Earnings" },
  { new_columns: ["Employee taxes Social Security"], label: "Social Security", category: "FICA" },
];

describe("suggestLegacyColumns", () => {
  test("returns mappings from Claude's JSON", async () => {
    const response = JSON.stringify({
      mappings: [
        { new_columns: ["Earnings Regular"], legacy_column: "Reg Pay", category: "Earnings", label: "Regular Earnings" },
        { new_columns: ["Earnings Overtime"], legacy_column: "OT Pay", category: "Earnings", label: "Overtime Earnings" },
      ],
    });
    const client = makeClient(response);

    const result = await suggestLegacyColumns(
      ["EmpID", "Reg Pay", "OT Pay", "Misc"],
      NEW_HEADERS,
      EXISTING_ENTRIES,
      [],
      client
    );

    expect(result).not.toHaveProperty("legacy_employee_key");
    expect(result.mappings).toEqual([
      { new_columns: ["Earnings Regular"], legacy_column: "Reg Pay", category: "Earnings", label: "Regular Earnings" },
      { new_columns: ["Earnings Overtime"], legacy_column: "OT Pay", category: "Earnings", label: "Overtime Earnings" },
    ]);
  });

  test("unmatched_legacy contains Legacy headers not accounted for by mappings", async () => {
    const response = JSON.stringify({
      mappings: [
        { new_columns: ["Earnings Regular"], legacy_column: "Reg Pay", category: "Earnings", label: "Regular Earnings" },
      ],
    });
    const client = makeClient(response);

    const result = await suggestLegacyColumns(
      ["EmpID", "Reg Pay", "OT Pay", "Misc"],
      NEW_HEADERS,
      EXISTING_ENTRIES,
      [],
      client
    );

    expect(result.unmatched_legacy).toEqual(["EmpID", "OT Pay", "Misc"]);
  });

  test("empty legacy_column does not count as matched", async () => {
    const response = JSON.stringify({
      legacy_employee_key: null,
      mappings: [
        { new_columns: ["Earnings Regular"], legacy_column: "", category: "Earnings", label: "Regular Earnings" },
      ],
    });
    const client = makeClient(response);

    const result = await suggestLegacyColumns(
      ["Reg Pay", "OT Pay"],
      NEW_HEADERS,
      EXISTING_ENTRIES,
      [],
      client
    );

    expect(result.unmatched_legacy).toEqual(["Reg Pay", "OT Pay"]);
  });

  test("columns without a mapping appear in unmatched_legacy", async () => {
    const response = JSON.stringify({
      mappings: [
        { new_columns: ["Earnings Regular"], legacy_column: "Reg Pay", category: "Earnings", label: "Regular Earnings" },
      ],
    });
    const client = makeClient(response);

    const result = await suggestLegacyColumns(["Reg Pay", "EmpID"], NEW_HEADERS, EXISTING_ENTRIES, [], client);

    expect(result.unmatched_legacy).toContain("EmpID");
  });

  test("throws a descriptive error when Claude returns an empty response", async () => {
    const client = makeClient("");

    await expect(
      suggestLegacyColumns(["Reg Pay"], NEW_HEADERS, EXISTING_ENTRIES, [], client)
    ).rejects.toThrow(/empty/i);
  });

  test("throws a descriptive error when Claude returns non-JSON text", async () => {
    const client = makeClient("Sorry, I cannot help with that.");

    await expect(
      suggestLegacyColumns(["Reg Pay"], NEW_HEADERS, EXISTING_ENTRIES, [], client)
    ).rejects.toThrow(/JSON/i);
  });

  test("key columns passed via keyColumnsToExclude are absent from unmatched_legacy", async () => {
    const response = JSON.stringify({
      mappings: [
        { new_columns: ["Earnings Regular"], legacy_column: "Reg Pay", category: "Earnings", label: "Regular Earnings" },
      ],
    });
    const client = makeClient(response);

    const result = await suggestLegacyColumns(
      ["emp_id", "Reg Pay", "OT Pay"],
      NEW_HEADERS,
      [],
      ["emp_id"],
      client
    );

    expect(result.unmatched_legacy).not.toContain("emp_id");
    expect(result.unmatched_legacy).toContain("OT Pay");
  });

  test("strips markdown fences before parsing", async () => {
    const json = JSON.stringify({
      legacy_employee_key: null,
      mappings: [
        { new_columns: ["Earnings Regular"], legacy_column: "Reg Pay", category: "Earnings", label: "Regular Earnings" },
      ],
    });
    const client = makeClient("```json\n" + json + "\n```");

    const result = await suggestLegacyColumns(["Reg Pay"], NEW_HEADERS, EXISTING_ENTRIES, [], client);

    expect(result.mappings[0].legacy_column).toBe("Reg Pay");
  });
});
