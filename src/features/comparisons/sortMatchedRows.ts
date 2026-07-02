import type { StoredMatchedRow, SortPreference } from "./types";

export function coerceSortPreference(value: string): SortPreference {
  if (value === "first_name" || value === "last_name" || value === "employee_key") return value;
  return "discrepancy_amount";
}

export function sortMatchedRows(rows: StoredMatchedRow[], preference: SortPreference): StoredMatchedRow[] {
  const sorted = [...rows];
  if (preference === "discrepancy_amount") {
    sorted.sort((a, b) => {
      const totalA = a.results.reduce((sum, r) => sum + Math.abs(r.difference), 0);
      const totalB = b.results.reduce((sum, r) => sum + Math.abs(r.difference), 0);
      return totalB - totalA;
    });
  } else if (preference === "employee_key") {
    sorted.sort((a, b) => (a.employee_key < b.employee_key ? -1 : a.employee_key > b.employee_key ? 1 : 0));
  } else if (preference === "first_name" || preference === "last_name") {
    const field = preference === "first_name" ? "employee_first_name" : "employee_last_name";
    sorted.sort((a, b) => {
      const nameA = a[field]?.toLowerCase() ?? null;
      const nameB = b[field]?.toLowerCase() ?? null;
      if (nameA === null && nameB === null) return 0;
      if (nameA === null) return 1;
      if (nameB === null) return -1;
      return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    });
  }
  return sorted;
}
