type EntryInput = {
  id: number;
  label: string;
  category: string;
  difference: number;
  auto_status: "resolved" | "unresolved";
  manual_override: "resolved" | "unresolved" | null;
};

type RowInput = {
  employee_key: string;
  employee_name: string | null;
  results: EntryInput[];
};

type ResultsInput = {
  matched: RowInput[];
};

import type { ByEmployeeEntry, MajorIssue, SummarizeResultsOutput } from "@/lib/types";
export type { ByEmployeeEntry, MajorIssue, SummarizeResultsOutput } from "@/lib/types";

export function summarizeResults(results: ResultsInput): SummarizeResultsOutput {
  const byEmployee = new Map<string, ByEmployeeEntry>();
  const unresolved: MajorIssue[] = [];

  for (const row of results.matched) {
    if (row.results.length === 0) continue;

    let resolved = 0;
    for (const r of row.results) {
      const effectiveStatus = r.manual_override ?? r.auto_status;
      if (effectiveStatus === "resolved") resolved++;
      else {
        unresolved.push({
          id: r.id,
          employee_key: row.employee_key,
          employee_name: row.employee_name,
          label: r.label,
          category: r.category,
          difference: r.difference,
        });
      }
    }

    byEmployee.set(row.employee_key, {
      name: row.employee_name,
      total: row.results.length,
      resolved,
    });
  }

  const majorIssues = unresolved
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 5);

  return { byEmployee, majorIssues };
}
