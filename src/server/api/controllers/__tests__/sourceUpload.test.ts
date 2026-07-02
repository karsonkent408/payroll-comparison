import { test, expect, describe, mock } from "bun:test";
import { SourceUploadController } from "../sourceUploadController";
import type { SourceSummary } from "@/lib/types";

function makeSourcesRepo(existing: SourceSummary | null = null) {
  return {
    find: mock(async () => existing),
    upsert: mock(async (input: Record<string, unknown>) => ({
      id: 1,
      comparison_id: input.comparison_id,
      type: input.type,
      file_name: input.file_name,
      uploaded_at: "2026-01-01T00:00:00Z",
      headers: input.headers,
      row_count: 1,
      detectedTypes: {},
      columnSections: {},
      legacy_provider: (input.legacy_provider as string) ?? null,
      format_notes: (input.format_notes as string) ?? null,
    } as SourceSummary)),
  };
}

function makeComparisonsRepo() {
  return {
    find: mock(async () => ({ id: 1, expected_employee_count: null })),
    update: mock(async (_id: number, _data: Record<string, unknown>) => null),
  };
}

function baseInput() {
  return {
    comparison_id: 1,
    type: "legacy" as const,
    file_name: "payroll.csv",
    headers: ["name", "salary"],
    rows: [{ name: "Alice", salary: "1000" }],
    detectedTypes: {} as Record<string, "number" | "string" | "date">,
    columnSections: {} as Record<string, string>,
  };
}

describe("SourceUploadController", () => {
  test("writes legacy_provider and format_notes to the source when supplied", async () => {
    const sourcesRepo = makeSourcesRepo();
    const comparisonsRepo = makeComparisonsRepo();
    const controller = new SourceUploadController();

    await controller.upload({
      sourcesRepo,
      comparisonsRepo,
      ...baseInput(),
      legacy_provider: "ADP",
      format_notes: "Summary rows at bottom",
    });

    const upsertCall = sourcesRepo.upsert.mock.calls[0][0];
    expect(upsertCall.legacy_provider).toBe("ADP");
    expect(upsertCall.format_notes).toBe("Summary rows at bottom");
  });

  test("writes expected_employee_count to the comparison when supplied", async () => {
    const sourcesRepo = makeSourcesRepo();
    const comparisonsRepo = makeComparisonsRepo();
    const controller = new SourceUploadController();

    await controller.upload({
      sourcesRepo,
      comparisonsRepo,
      ...baseInput(),
      expected_employee_count: 25,
    });

    expect(comparisonsRepo.update.mock.calls[0][1]).toEqual({ expected_employee_count: 25 });
  });

  test("preserves existing legacy_provider and format_notes when absent from the upload", async () => {
    const existingSource: SourceSummary = {
      id: 1, comparison_id: 1, type: "legacy",
      file_name: "old.csv", uploaded_at: "2026-01-01T00:00:00Z",
      headers: ["name"], row_count: 1,
      detectedTypes: {}, columnSections: {},
      legacy_provider: "ADP", format_notes: "Header on row 3",
    };
    const sourcesRepo = makeSourcesRepo(existingSource);
    const comparisonsRepo = makeComparisonsRepo();
    const controller = new SourceUploadController();

    await controller.upload({ sourcesRepo, comparisonsRepo, ...baseInput() });

    const upsertCall = sourcesRepo.upsert.mock.calls[0][0];
    expect(upsertCall.legacy_provider).toBe("ADP");
    expect(upsertCall.format_notes).toBe("Header on row 3");
  });

  test("does not call comparisonsRepo.update when expected_employee_count is absent", async () => {
    const sourcesRepo = makeSourcesRepo();
    const comparisonsRepo = makeComparisonsRepo();
    const controller = new SourceUploadController();

    await controller.upload({ sourcesRepo, comparisonsRepo, ...baseInput() });

    expect(comparisonsRepo.update).not.toHaveBeenCalled();
  });
});
