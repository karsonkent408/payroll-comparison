import { comparisonRepo } from "@/server/db/repos/comparisons";
import type { ComparisonFilter } from "@/server/db/repos/comparisons";
import type { ComparisonSummary, ComparisonSummaryData, ControllerReturn, ListComparisonsResult } from "@/server/api/util/types";

export class ComparisonController {
  async listComparisons(opts: {
    filters?: ComparisonFilter[];
    page?: number;
    pageSize?: number;
    viewerId?: string;
    viewerRole?: string;
  }): Promise<ControllerReturn<ListComparisonsResult>> {
    const results = await comparisonRepo.list(opts)

    return { status: 200, data: results };
  }

  async getComparison(id: number): Promise<ControllerReturn<ComparisonSummary>> {
    const comparison = await comparisonRepo.find(id);
    if (!comparison) return { status: 404, error: "Not found" };
    return { status: 200, data: comparison };
  }

  async getSummary(id: number): Promise<ControllerReturn<ComparisonSummaryData>> {
    const summary = await comparisonRepo.getSummary(id);
    if (!summary) return { status: 404, error: "Not found" };
    return { status: 200, data: summary };
  }

  async createComparison(data: {
    label: string;
    pay_period_start: string;
    pay_period_end: string;
    description?: string;
    created_by?: string | null;
    owner_id: string;
  }): Promise<ControllerReturn<ComparisonSummary>> {
    return { status: 201, data: await comparisonRepo.create(data) };
  }

  async updateComparison(
    id: number,
    data: {
      label?: string;
      pay_period_start?: string;
      pay_period_end?: string;
      description?: string;
      sort_preference?: string;
    }
  ): Promise<ControllerReturn<ComparisonSummary>> {
    const comparison = await comparisonRepo.update( id, data);
    if (!comparison) return { status: 404, error: "Not found" };
    return { status: 200, data: comparison };
  }

  async deleteComparison(id: number): Promise<ControllerReturn<{ success: true }>> {
    const deleted = await comparisonRepo.delete(id);
    if (!deleted) return { status: 404, error: "Not found" };
    return { status: 200, data: { success: true } };
  }
}


export const comparisonCntrl = new ComparisonController()