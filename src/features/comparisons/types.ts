import type { ReconfigureMapping } from "@/server/api/schemas/reconfigureSchema";

export type StoredEntryResult = {
  id: number;
  column_entry_id: string;
  legacy_columns: string[];
  new_columns: string[];
  category: string;
  label: string;
  display_order: number;
  legacy_value: number;
  legacy_breakdown: Record<string, number> | null;
  new_value: number;
  new_breakdown: Record<string, number> | null;
  difference: number;
  tolerance: number;
  auto_status: "resolved" | "unresolved";
  manual_override: "resolved" | "unresolved" | null;
  note: string | null;
};

export type DiscrepancyEntry = StoredEntryResult & {
  employee_key: string;
  employee_name: string | null;
};

export type SortPreference = 'discrepancy_amount' | 'first_name' | 'last_name' | 'employee_key';

export type StoredMatchedRow = {
  employee_key: string;
  employee_name: string | null;
  employee_first_name?: string | null;
  employee_last_name?: string | null;
  results: StoredEntryResult[];
};

export type StoredUnmatchedEmployee = {
  id: string;
  employee_key: string;
  employee_name: string | null;
  source_type: "legacy" | "new";
  resolved: boolean;
  note: string | null;
};

export type StoredResults = {
  matched: StoredMatchedRow[];
  unmatched: StoredUnmatchedEmployee[];
};

export type UploadedSource = {
    file_name: string;
    row_count: number;
    headers: string[];
    columnSections: Record<string, string>;
    legacy_provider: string | null;
    format_notes: string | null;
};

export type SourceState =
    | { status: "idle" }
    | { status: 'uploading'}
    | { status: 'pending', file: File}
    | { status: "done"; source: UploadedSource }
    | { status: "error"; message: string };

export type CreateComparisonInput = {
    label: string;
    pay_period_start: string;
    pay_period_end: string;
    description?: string;
};

export type UpdateComparisonInput = {
    id: string;
    label?: string;
    pay_period_start?: string;
    pay_period_end?: string;
    description?: string;
    owner_id?: string;
    sort_preference?: SortPreference;
};

export type EmployeeMappingInput = {
    legacy_employee_key: string[];
    new_employee_key: string[];
    employee_match_mode?: "exact" | "fuzzy";
    new_first_name_column?: string | null;
    new_last_name_column?: string | null;
};

export type ReconfigureInput = {
    id: string;
    mapping: ReconfigureMapping;
    resetStatuses?: boolean;
    resetNotes?: boolean;
    legacyFile?: File | null;
    newFile?: File | null;
};
