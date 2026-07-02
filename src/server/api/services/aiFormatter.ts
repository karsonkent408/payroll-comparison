import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { parseFile } from "./fileParser";
import { createAnthropicClient } from "@/server/api/util/anthropic";
import type { FormatContext, FormatResult } from "@/shared/lib/types";

type AnthropicClient = InstanceType<typeof Anthropic>;

const FORMAT_PROMPT = `You are a construction payroll data formatter. Your job is to extract employee-level payroll data from a file and return a structured JSON envelope.

Always respond with a JSON object matching exactly one of these three shapes:
- {"status": "ok", "csv": "<csv string>", "notes": ["..."]}    — confident extraction, notes optional
- {"status": "flag", "csv": "<csv string>", "flags": ["..."]}  — best-effort extraction with assumptions or anomalies the user should confirm
- {"status": "needs_input", "questions": ["..."]}               — structurally confused; withhold CSV and ask clarifying questions

Never return raw CSV. Always return valid JSON — no explanation, no markdown fences, no extra text.

Construction payroll extraction rules:
- Each row is one employee; no summary rows, total rows, subtotals, grand totals, blank separator rows, or report metadata rows
- No merged cells or multi-level headers — flatten everything into a single header row
- Preserve each distinct payroll item as its own column — never merge union dues, pension, annuity, training fund, or any named item into a generic bucket
- Keep fringe identity distinct by plan family, subtype, and payer side
- Net derivation hierarchy: explicit stated net outranks derived; derive only when components are sufficient
- Non-cash earnings (imputed income, S-corp health/HSA) appear in gross but not cash — subtract when deriving net
- All clients are construction payrolls; apply construction rules unconditionally

Column recognition categories (use as guidance, not grouping instructions):
- Employee identifiers (employee ID, name, department, etc.)
- Hours (regular hours, overtime hours, PTO, etc.)
- Earnings (regular pay, overtime pay, bonuses, commissions, etc.)
- Non-Taxed Earnings (expense reimbursements, non-taxable allowances, etc.)
- FICA (Social Security, Medicare employee and employer portions)
- Benefits (health insurance, dental, vision, 401k employee contributions, etc.)
- Deductions (garnishments, loan repayments, etc.)
- Taxes (federal, state, local withholding)
- Fringes (union dues, pension, annuity, training funds, and all other named union-related items)
- Net Pay

Include all columns that contain per-employee payroll values. Exclude columns that are clearly report formatting artifacts (page numbers, run dates, report titles, blank columns).`;

export async function formatSource(
  fileBuffer: Buffer,
  filename: string,
  context?: FormatContext,
  priorResponse?: string,
  answers?: string,
  client: AnthropicClient = createAnthropicClient(),
  signal?: AbortSignal,
): Promise<FormatResult> {
  const ext = filename.split(".").pop()?.toLowerCase();

  let fileContentBlock: Anthropic.ContentBlockParam;

  if (ext === "pdf") {
    fileContentBlock = {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: fileBuffer.toString("base64"),
      },
    };
  } else if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const csvText = XLSX.utils.sheet_to_csv(sheet);
    fileContentBlock = { type: "text", text: `File: ${filename}\n\n${csvText}` };
  } else {
    fileContentBlock = {
      type: "text",
      text: `File: ${filename}\n\n${fileBuffer.toString("utf-8")}`,
    };
  }

  const contextPrefix = buildContextPrefix(context);
  const firstUserContent: Anthropic.ContentBlockParam[] = [];
  if (contextPrefix) {
    firstUserContent.push({ type: "text", text: contextPrefix });
  }
  firstUserContent.push(fileContentBlock);

  let messages: Anthropic.MessageParam[];
  if (priorResponse && answers) {
    messages = [
      { role: "user", content: firstUserContent },
      { role: "assistant", content: priorResponse },
      { role: "user", content: answers },
    ];
  } else {
    messages = [{ role: "user", content: firstUserContent }];
  }

  const stream = client.messages.stream(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 128000,
      thinking: { type: "enabled", budget_tokens: 4000 },
      system: FORMAT_PROMPT,
      messages,
    },
    {
      signal,
      headers: { "anthropic-beta": "output-128k-2025-02-19", "cf-aig-metadata": JSON.stringify({ request_type: "format" }) },
    },
  );

  const response = await stream.finalMessage();
  const result = parseFormatResult(extractText(response));

  if (priorResponse && answers && result.status === "needs_input") {
    throw new Error(
      "Claude returned needs_input on a retry call — cannot loop further.",
    );
  }

  return applyRowCountCheck(result, context);
}

export async function formatSourceStreaming(
  fileBuffer: Buffer,
  filename: string,
  context?: FormatContext,
  priorResponse?: string,
  answers?: string,
  client: AnthropicClient = createAnthropicClient(),
  signal?: AbortSignal,
  onThinking?: (delta: string) => void,
): Promise<FormatResult> {
  const ext = filename.split(".").pop()?.toLowerCase();

  let fileContentBlock: Anthropic.ContentBlockParam;

  if (ext === "pdf") {
    fileContentBlock = {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: fileBuffer.toString("base64"),
      },
    };
  } else if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const csvText = XLSX.utils.sheet_to_csv(sheet);
    fileContentBlock = { type: "text", text: `File: ${filename}\n\n${csvText}` };
  } else {
    fileContentBlock = {
      type: "text",
      text: `File: ${filename}\n\n${fileBuffer.toString("utf-8")}`,
    };
  }

  const contextPrefix = buildContextPrefix(context);
  const firstUserContent: Anthropic.ContentBlockParam[] = [];
  if (contextPrefix) {
    firstUserContent.push({ type: "text", text: contextPrefix });
  }
  firstUserContent.push(fileContentBlock);

  let messages: Anthropic.MessageParam[];
  if (priorResponse && answers) {
    messages = [
      { role: "user", content: firstUserContent },
      { role: "assistant", content: priorResponse },
      { role: "user", content: answers },
    ];
  } else {
    messages = [{ role: "user", content: firstUserContent }];
  }

  const stream = client.messages.stream(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 128000,
      thinking: { type: "enabled", budget_tokens: 4000 },
      system: FORMAT_PROMPT,
      messages,
    },
    {
      signal,
      headers: { "anthropic-beta": "output-128k-2025-02-19", "cf-aig-metadata": JSON.stringify({ request_type: "format" }) },
    },
  );

  if (onThinking) {
    stream.on("thinking", (delta: string) => onThinking(delta));
  }

  const response = await stream.finalMessage();
  const result = parseFormatResult(extractText(response));

  if (priorResponse && answers && result.status === "needs_input") {
    throw new Error(
      "Claude returned needs_input on a retry call — cannot loop further.",
    );
  }

  return applyRowCountCheck(result, context);
}

export async function refineSource(
  currentCsv: string,
  instruction: string,
  context?: FormatContext,
  client: AnthropicClient = createAnthropicClient(),
  signal?: AbortSignal,
): Promise<FormatResult> {
  const contextPrefix = buildContextPrefix(context);
  const prefix = contextPrefix ? `${contextPrefix}\n\n` : "";
  const userMessage = `${prefix}Here is the current formatted CSV:\n\n${currentCsv}\n\nInstruction: ${instruction}\n\nReturn a JSON envelope as instructed.`;

  const stream = await client.messages.stream(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 128000,
      thinking: { type: "enabled", budget_tokens: 4000 },
      system: FORMAT_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    },
    {
      signal,
      headers: { "anthropic-beta": "output-128k-2025-02-19", "cf-aig-metadata": JSON.stringify({ request_type: "refine" }) },
    },
  );

  const response = await stream.finalMessage();
  const result = parseFormatResult(extractText(response));

  if (result.status === "needs_input") {
    throw new Error(
      "Claude asked for clarification instead of refining. Try rephrasing your instruction.",
    );
  }

  return result;
}

function buildContextPrefix(context?: FormatContext): string {
  if (!context) return "";
  const parts: string[] = [`Payroll provider: ${context.provider}`];
  if (context.employeeCount !== undefined) {
    parts.push(`Expected employee count: ${context.employeeCount}`);
  }
  if (context.notes) {
    parts.push(`Notes: ${context.notes}`);
  }
  return parts.join("\n");
}

function extractText(response: {
  content: { type: string; text?: string }[];
}): string {
  const block = response.content.find((b) => b.type === "text");
  return block?.text?.trim() ?? "";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function stripToJson(text: string): string {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Fall back to extracting the outermost {...} block
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text;
}

function parseFormatResult(text: string): FormatResult {
  if (!text) {
    throw new Error(
      "Claude returned an empty response — could not format the file.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripToJson(text));
  } catch {
    throw new Error(
      "Claude returned non-JSON output — expected a JSON envelope.",
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      "Claude returned non-JSON output — expected a JSON envelope.",
    );
  }

  if (parsed.status === "ok" && typeof parsed.csv === "string") {
    assertHasDataRows(parsed.csv);
    const notes = isStringArray(parsed.notes) ? parsed.notes : undefined;
    return { status: "ok", csv: parsed.csv, notes };
  }

  if (
    parsed.status === "flag" &&
    typeof parsed.csv === "string" &&
    isStringArray(parsed.flags)
  ) {
    assertHasDataRows(parsed.csv);
    return { status: "flag", csv: parsed.csv, flags: parsed.flags };
  }

  if (parsed.status === "needs_input" && isStringArray(parsed.questions)) {
    return { status: "needs_input", questions: parsed.questions };
  }

  throw new Error(
    "Claude returned non-JSON output — expected a JSON envelope.",
  );
}

function assertHasDataRows(csv: string): void {
  const parsed = parseFile(Buffer.from(csv), "output.csv");
  if (!parsed.ok || parsed.rows.length === 0) {
    throw new Error(
      "Claude returned a CSV with no data rows.",
    );
  }
}

function applyRowCountCheck(result: FormatResult, context?: FormatContext): FormatResult {
  if (result.status !== "ok" || !context?.employeeCount || context.employeeCount <= 0) {
    return result;
  }

  const parsed = parseFile(Buffer.from(result.csv), "output.csv");
  if (!parsed.ok) return result;

  const extractedCount = parsed.rows.length;
  const expectedCount = context.employeeCount;
  const difference = Math.abs(extractedCount - expectedCount) / expectedCount;

  if (difference > 0.2) {
    return {
      status: "flag",
      csv: result.csv,
      flags: [
        `Employee count mismatch: extracted ${extractedCount} rows but expected ~${expectedCount} (${Math.round(difference * 100)}% difference)`,
      ],
    };
  }

  return result;
}
