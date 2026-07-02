import type { ComparisonCategory } from '@/lib/types';
import { comparisons } from '@/server/db/schema'

export type ComparisonStatus = "setup" | "pass" | "fail" | "in_progress";

export type CategoryStats = { total: number; resolved: number };

export type ComparisonSummaryData = {
  status: ComparisonStatus;
  byCategory: Record<string, CategoryStats>;
  unmatched: { total: number; resolved: number };
};
export type Comparison = typeof comparisons.$inferSelect;
export type ComparisonSummary = Comparison & { status: ComparisonStatus; owner: { name: string, id: string } | null };
export type ListComparisonsResult = { items: ComparisonSummary[]; total: number; page: number; pageSize: number };


export type ColumnMappingEntryInput = {
  category: ComparisonCategory;
  label: string;
  tolerance: number;
  display_order: number;
  legacy_columns: string[];
  new_columns: string[];
};

export type StoredColumnMappingEntry = {
  id: string;
  comparison_id: number;
  category: ComparisonCategory;
  label: string;
  tolerance: number;
  display_order: number;
  legacy_columns: string[];
  new_columns: string[];
};

type Ok<T> = { status: 200 | 201 | 202; data: T }
type Err = { status: 400 | 403 | 404 | 409 | 422 | 500; error: string }
export type ControllerReturn<T> = Ok<T> | Err
