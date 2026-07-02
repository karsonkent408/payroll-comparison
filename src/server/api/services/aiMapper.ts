import Anthropic from "@anthropic-ai/sdk";
import { COMPARISON_CATEGORIES } from "@/lib/types";
import { createAnthropicClient } from "@/server/api/util/anthropic";
import type { ComparisonCategory, NewEntry, ColumnSuggestion } from "@/lib/types";
export type { NewEntry, ColumnSuggestion } from "@/lib/types";

type AnthropicClient = InstanceType<typeof Anthropic>;

type ClaudeResponse = {
  mappings: Array<{
    new_columns: string[];
    legacy_column: string;
    category: ComparisonCategory;
    label: string;
  }>;
};

const SYSTEM_PROMPT = `You are a payroll data analyst. Your job is to build a mapping between Legacy and New payroll columns.

You will be given:
- A list of Legacy column headers from a payroll register
- A list of all New column headers
- A list of entries already in the mapping (preserve their new_columns)

For each New column that represents a numeric payroll value (hours, pay, taxes, deductions, benefits, net), create a mapping entry.
Skip New columns that are employee identifiers (name, ID, department, crew, title, pay type).

Return a JSON object with this exact shape:
{
  "mappings": [
    {
      "new_columns": ["<New column name>"],
      "legacy_column": "<matching Legacy column name, or empty string if no confident match>",
      "category": "<one of: Hours, Earnings, Non-Taxed Earnings, FICA, Benefits, Deductions, Taxes, Fringes, Net>",
      "label": "<short descriptive label>"
    }
  ]
}

Category guide:
- Hours: hours worked
- Earnings: regular pay, overtime, bonuses (taxable)
- Non-Taxed Earnings: non-taxable compensation
- FICA: Social Security and Medicare (employee and employer share)
- Benefits: employer-paid health, dental, vision, HSA contributions
- Deductions: employee-paid deductions
- Taxes: income taxes (federal, state, local)
- Fringes: fringe benefits
- Net: net pay amounts

Rules:
- Only fill legacy_column when you are confident of the match; use "" if uncertain
- Respond with ONLY the JSON object — no explanation, no markdown fences, no extra text.`;

export async function suggestLegacyColumns(
  legacyHeaders: string[],
  newHeaders: string[],
  existingEntries: NewEntry[],
  keyColumnsToExclude: string[] = [],
  client: AnthropicClient = createAnthropicClient(),
  signal?: AbortSignal
): Promise<ColumnSuggestion> {
  const existingBlock = existingEntries.length > 0
    ? `\n\nAlready-mapped entries (preserve these new_columns):\n${existingEntries.map((e) => `- ${e.label} (columns: ${e.new_columns.join(", ")})`).join("\n")}`
    : "";

  const userMessage =
    `Legacy columns:\n${legacyHeaders.map((h) => `- ${h}`).join("\n")}\n\n` +
    `New columns:\n${newHeaders.map((h) => `- ${h}`).join("\n")}` +
    existingBlock;

  const response = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    },
    { signal }
  );

  const text = extractText(response);
  const parsed = parseResponse(text);

  const accountedFor = new Set<string>([...keyColumnsToExclude]);
  for (const m of parsed.mappings) {
    if (m.legacy_column) accountedFor.add(m.legacy_column);
  }

  const unmatched_legacy = legacyHeaders.filter((h) => !accountedFor.has(h));

  return {
    mappings: parsed.mappings,
    unmatched_legacy,
  };
}

function extractText(response: { content: { type: string; text?: string }[] }): string {
  const block = response.content.find((b) => b.type === "text");
  return block?.text?.trim() ?? "";
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

function parseResponse(text: string): ClaudeResponse {
  if (!text) {
    throw new Error("Claude returned an empty response — could not suggest column mappings.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new Error("Claude returned a response that could not be parsed as JSON.");
  }
  const p = parsed as Record<string, unknown>;
  const rawMappings = Array.isArray(p.mappings) ? p.mappings : [];
  const mappings = rawMappings.map((m: Record<string, unknown>) => ({
    new_columns: Array.isArray(m.new_columns) ? (m.new_columns as string[]) : [],
    legacy_column: typeof m.legacy_column === "string" ? m.legacy_column : "",
    category: (COMPARISON_CATEGORIES as readonly string[]).includes(m.category as string)
      ? (m.category as ComparisonCategory)
      : ("Earnings" as ComparisonCategory),
    label: typeof m.label === "string" ? m.label : "",
  }));
  return { mappings };
}
