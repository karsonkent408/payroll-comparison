import type { ServerWebSocket } from "bun";
import type { User } from "better-auth";
// --- Categories ---

export const COMPARISON_CATEGORIES = [
  "Hours",
  "Earnings",
  "Non-Taxed Earnings",
  "FICA",
  "Benefits",
  "Deductions",
  "Taxes",
  "Fringes",
  "Net",
] as const;

export type ComparisonCategory = (typeof COMPARISON_CATEGORIES)[number];

// --- Mapping engine ---

export type MappingEntry = {
  legacy_columns: string[];
  new_columns: string[];
  tolerance: number;
};

export type EmployeeMatchMode = "exact" | "fuzzy";

export type ColumnMapping = {
  legacy_employee_key: string[];
  new_employee_key: string[];
  employee_match_mode?: EmployeeMatchMode;
  entries: MappingEntry[];
};

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export type HeaderDiff = { added: string[]; removed: string[] };

export type StoredEntryShape = {
  legacy_columns: string[];
  new_columns: string[];
  tolerance: number;
  category: ComparisonCategory;
  display_order: number;
};

export type FlaggedEntry = {
  legacy_columns: string[];
  new_columns: string[];
  missing_legacy: string[];
  missing_new: string[];
  category: string;
};

export type CopyMappingResult = {
  mapping: {
    legacy_employee_key: string[];
    new_employee_key: string[];
    entries: (StoredEntryShape & { missing_legacy: string[]; missing_new: string[] })[];
  };
  flagged: FlaggedEntry[];
};

// --- Resolution matching ---

export type EntryColumnSet = {
  legacy_columns: string[];
  new_columns: string[];
};

// --- File parser ---

export type ParseResult =
  | {
      ok: true;
      headers: string[];
      rows: Record<string, string>[];
      detectedTypes: Record<string, "number" | "string" | "date">;
      columnSections: Record<string, string>;
    }
  | { ok: false; error: string };

// --- AI formatter ---

export type FormatResult =
  | { status: 'ok'; csv: string; notes?: string[] }
  | { status: 'flag'; csv: string; flags: string[] }
  | { status: 'needs_input'; questions: string[] };

export type FormatContext = {
  provider: string;
  employeeCount?: number;
  notes?: string;
};

// --- AI mapper ---

export type NewEntry = {
  new_columns: string[];
  label: string;
  category: string;
};

export type ColumnSuggestion = {
  mappings: Array<{
    new_columns: string[];
    legacy_column: string;
    category: ComparisonCategory;
    label: string;
  }>;
  unmatched_legacy: string[];
};

// --- Comparison engine ---

export type EntryResult = {
  entry: MappingEntry;
  legacy_value: number;
  legacy_breakdown: Record<string, number> | null;
  new_value: number;
  new_breakdown: Record<string, number> | null;
  difference: number;
  auto_status: "resolved" | "unresolved";
};

export type MatchedRow = {
  employee_key: string;
  results: EntryResult[];
};

export type UnmatchedEmployee = {
  employee_key: string;
  source: "legacy" | "new";
};

export type ComparisonResult = {
  matched: MatchedRow[];
  unmatched: UnmatchedEmployee[];
};

// --- DB: mapping ---

export type StoredMappingEntry = {
  id: string;
  mapping_id: number;
  legacy_columns: string[];
  new_columns: string[];
  tolerance: number;
  category: ComparisonCategory;
  display_order: number;
  label: string;
};

export type StoredColumnMapping = {
  id: number;
  comparison_id: number;
  legacy_employee_key: string[];
  new_employee_key: string[];
  employee_match_mode: EmployeeMatchMode;
  new_first_name_column: string | null;
  new_last_name_column: string | null;
  created_at: string;
  updated_at: string;
  entries: StoredMappingEntry[];
};

// --- DB: sources ---

export type Source = {
  id: number;
  comparison_id: number;
  type: "legacy" | "new";
  file_name: string;
  uploaded_at: string;
  headers: string[];
  rows: Record<string, string>[];
  row_count: number;
  detectedTypes: Record<string, "number" | "string" | "date">;
  columnSections: Record<string, string>;
  legacy_provider: string | null;
  format_notes: string | null;
};

export type SourceSummary = Omit<Source, "rows">;

// --- Summarize results ---

export type ByEmployeeEntry = { name: string | null; total: number; resolved: number };

export type MajorIssue = {
  id: number;
  employee_key: string;
  employee_name: string | null;
  label: string;
  category: string;
  difference: number;
};

export type SummarizeResultsOutput = {
  byEmployee: Map<string, ByEmployeeEntry>;
  majorIssues: MajorIssue[];
};

// --- Fuzzy matching ---

export type FuzzyMatchCandidate = {
  legacy_key: string;
  new_key: string;
  overlap: number;
  conflict: boolean;
};

// --- Auto mapping ---

export type AutoEntry = {
  legacy_columns: string[];
  new_columns: string[];
  category: ComparisonCategory;
  label: string;
  tolerance?: number;
};

// --- Web sockets ---

export interface RoomClient {
  socket: ServerWebSocket<WSData>;
  userId: string;
  userName: string;
}
 
export interface WSData {
  runId: string;
  userId: string;
  userName: string;
}
 

export type RoomMessage =
  | {
      type: "presence";
      users: { userId: string; userName: string; color: `#${string}`; userImage: string | null }[];
    }
  | {
      type: "edit";
      entryId: string;
      field: string;
      value: unknown;
      updatedBy: string;
    }
  | {
      type: "comment";
      id: string;
      entryId: string;
      body: string;
      authorId: string;
      authorName: string;
      createdAt: string;
    }
  | {
      type: "status";
      runId: string;
      status: "pending" | "in_review" | "approved" | "flagged";
      updatedBy: string;
    }
  | {
      type: "reconfigure";
      updatedBy: { id: string; name: string };
    }
  | {
      type: "deleted";
      updatedBy: string;
    }
  | {
      type: "entry_focus";
      entryId: number;
      userId: string;
    }
  | {
      type: "entry_blur";
      entryId: number;
      userId: string;
    }
  | {
      type: "note_focus";
      entryId: number;
      userId: string;
    }
  | {
      type: "note_blur";
      entryId: number;
      userId: string;
    };


export type MyUser = User & {
  role: string
}