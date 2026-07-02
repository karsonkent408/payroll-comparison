import { test, expect, describe } from "bun:test";
import { formatSource, refineSource } from "@/server/api/services/aiFormatter";
import type Anthropic from "@anthropic-ai/sdk";
import type { FormatResult } from "@/shared/lib/types";

type AnthropicClient = InstanceType<typeof Anthropic>;

function makeClient(text: string): AnthropicClient {
  return {
    messages: {
      stream: () => ({
        finalMessage: async () => ({
          stop_reason: "end_turn",
          content: [{ type: "text", text }],
        }),
      }),
    },
  } as unknown as AnthropicClient;
}

const VALID_CSV = `employee_id,salary\n101,75000\n102,82000`;

const okResponse: FormatResult = { status: 'ok', csv: VALID_CSV };
const flagResponse: FormatResult = { status: 'flag', csv: VALID_CSV, flags: ['Some columns were guessed'] };
const needsInputResponse: FormatResult = { status: 'needs_input', questions: ['What pay period does this cover?'] };

describe("formatSource", () => {
  test("returns {status:'ok'} when Claude returns valid ok JSON", async () => {
    const client = makeClient(JSON.stringify(okResponse));

    const result = await formatSource(Buffer.from("raw file"), "payroll.csv", undefined, undefined, undefined, client);

    expect(result).toEqual(okResponse);
  });

  test("returns {status:'flag'} when Claude returns valid flag JSON", async () => {
    const client = makeClient(JSON.stringify(flagResponse));

    const result = await formatSource(Buffer.from("raw file"), "payroll.csv", undefined, undefined, undefined, client);

    expect(result).toEqual(flagResponse);
  });

  test("returns {status:'needs_input'} when Claude returns valid needs_input JSON", async () => {
    const client = makeClient(JSON.stringify(needsInputResponse));

    const result = await formatSource(Buffer.from("raw file"), "payroll.csv", undefined, undefined, undefined, client);

    expect(result).toEqual(needsInputResponse);
  });

  test("upgrades ok to flag when row count differs from employeeCount by >20%", async () => {
    // CSV has 2 rows, employeeCount is 10 — difference is 80%, should upgrade
    const client = makeClient(JSON.stringify(okResponse));

    const result = await formatSource(Buffer.from("raw file"), "payroll.csv", { provider: 'ADP', employeeCount: 10 }, undefined, undefined, client);

    expect(result.status).toBe('flag');
    if (result.status === 'flag') {
      expect(result.flags.some(f => /employee count/i.test(f))).toBe(true);
    }
  });

  test("does not upgrade ok when row count is within 20% of employeeCount", async () => {
    // CSV has 2 rows, employeeCount is 2 — exact match, should stay ok
    const client = makeClient(JSON.stringify(okResponse));

    const result = await formatSource(Buffer.from("raw file"), "payroll.csv", { provider: 'ADP', employeeCount: 2 }, undefined, undefined, client);

    expect(result.status).toBe('ok');
  });

  test("throws a descriptive error when Claude returns an empty string", async () => {
    const client = makeClient("");

    await expect(
      formatSource(Buffer.from("raw file"), "payroll.csv", undefined, undefined, undefined, client)
    ).rejects.toThrow(/empty/i);
  });

  test("throws a descriptive error when Claude returns non-JSON text", async () => {
    const client = makeClient("Sorry, I cannot process this file.");

    await expect(
      formatSource(Buffer.from("raw file"), "payroll.csv", undefined, undefined, undefined, client)
    ).rejects.toThrow(/json/i);
  });

  test("succeeds on retry path (priorResponse + answers provided)", async () => {
    const client = makeClient(JSON.stringify(okResponse));
    const priorResponse = JSON.stringify(needsInputResponse);

    const result = await formatSource(Buffer.from("raw file"), "payroll.csv", undefined, priorResponse, "The pay period is March 2025", client);

    expect(result.status).toBe('ok');
  });

  test("throws when Claude returns needs_input on a retry call", async () => {
    const client = makeClient(JSON.stringify(needsInputResponse));
    const priorResponse = JSON.stringify(needsInputResponse);

    await expect(
      formatSource(Buffer.from("raw file"), "payroll.csv", undefined, priorResponse, "The pay period is March 2025", client)
    ).rejects.toThrow(/needs_input/i);
  });
});

describe("refineSource", () => {
  test("returns {status:'ok'} when Claude returns valid ok JSON", async () => {
    const client = makeClient(JSON.stringify(okResponse));

    const result = await refineSource(VALID_CSV, "rename salary to gross_pay", undefined, client);

    expect(result).toEqual(okResponse);
  });

  test("returns {status:'flag'} when Claude returns valid flag JSON", async () => {
    const client = makeClient(JSON.stringify(flagResponse));

    const result = await refineSource(VALID_CSV, "rename salary to gross_pay", undefined, client);

    expect(result).toEqual(flagResponse);
  });

  test("throws when Claude returns needs_input", async () => {
    const client = makeClient(JSON.stringify(needsInputResponse));

    await expect(
      refineSource(VALID_CSV, "make it better", undefined, client)
    ).rejects.toThrow(/rephrasing/i);
  });
});
