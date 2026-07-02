import type { SourceSummary } from "@/lib/types";

type UpsertInput = {
  comparison_id: number;
  type: "legacy" | "new";
  file_name: string;
  headers: string[];
  rows: Record<string, string>[];
  detectedTypes: Record<string, "number" | "string" | "date">;
  columnSections?: Record<string, string>;
  legacy_provider?: string;
  format_notes?: string;
};

type SourcesRepo = {
  find: (comparison_id: number, type: "legacy" | "new") => Promise<SourceSummary | null>;
  upsert: (input: UpsertInput) => Promise<SourceSummary>;
};

type ComparisonsRepo = {
  find: (id: number) => Promise<{ id: number; expected_employee_count: number | null } | null>;
  update: (id: number, data: { expected_employee_count?: number | null }) => Promise<unknown>;
};

type UploadInput = UpsertInput & {
  sourcesRepo: SourcesRepo;
  comparisonsRepo: ComparisonsRepo;
  expected_employee_count?: number;
};

export class SourceUploadController {
  async upload(opts: UploadInput): Promise<SourceSummary> {
    const { sourcesRepo, comparisonsRepo, expected_employee_count, ...rest } = opts;

    const existing = opts.type === "legacy"
      ? await sourcesRepo.find(opts.comparison_id, "legacy")
      : null;

    const upsertInput: UpsertInput = {
      comparison_id: rest.comparison_id,
      type: rest.type,
      file_name: rest.file_name,
      headers: rest.headers,
      rows: rest.rows,
      detectedTypes: rest.detectedTypes,
      columnSections: rest.columnSections,
      legacy_provider: rest.legacy_provider !== undefined
        ? rest.legacy_provider
        : (existing?.legacy_provider ?? undefined),
      format_notes: rest.format_notes !== undefined
        ? rest.format_notes
        : (existing?.format_notes ?? undefined),
    };

    const source = await sourcesRepo.upsert(upsertInput);

    if (expected_employee_count !== undefined) {
      await comparisonsRepo.update(opts.comparison_id, { expected_employee_count });
    }

    return source;
  }
}
