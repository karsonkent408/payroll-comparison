import type { ComparisonCategory, AutoEntry } from "@/lib/types";
export type { AutoEntry } from "@/lib/types";

function normalizeLabel(label: string): string {
  return label.toLowerCase().trim().replace(/s$/, "");
}

function shouldMerge(labelA: string, labelB: string): boolean {
  const na = normalizeLabel(labelA);
  const nb = normalizeLabel(labelB);
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

function mergeSimilarEntries(entries: AutoEntry[]): AutoEntry[] {
  const merged: AutoEntry[] = [];
  for (const entry of entries) {
    const existing = merged.find(
      (m) => m.category === entry.category && shouldMerge(m.label, entry.label)
    );
    if (existing) {
      existing.new_columns.push(...entry.new_columns);
      if (entry.label.length > existing.label.length) existing.label = entry.label;
      if (entry.tolerance !== undefined && existing.tolerance === undefined)
        existing.tolerance = entry.tolerance;
    } else {
      merged.push({ ...entry, new_columns: [...entry.new_columns] });
    }
  }
  return merged;
}

const SECTION_CATEGORY: Record<string, ComparisonCategory> = {
  "Earnings": "Earnings",
  "Reimbursements": "Non-Taxed Earnings",
  "Employee benefit contributions": "Benefits",
  "Company benefit contributions": "Benefits",
  "Post tax deductions": "Deductions",
  "Fringes": "Fringes",
};

const TOTALS_CATEGORY: Record<string, ComparisonCategory> = {
  "Hours": "Hours",
  "Net": "Net",
  "Gross": "Earnings",
};

function stripSectionPrefix(header: string, section: string): string {
  const prefix = section + " ";
  return header.startsWith(prefix) ? header.slice(prefix.length) : header;
}

export function buildAutoEntries(
  newHeaders: string[],
  columnSections: Record<string, string>
): AutoEntry[] {
  const entries: AutoEntry[] = [];
  let totalsGross: AutoEntry | undefined;

  for (const header of newHeaders) {
    const section = columnSections[header];
    if (!section) continue;

    const label = stripSectionPrefix(header, section);

    let category: ComparisonCategory | undefined;
    if (section === "Totals") {
      category = TOTALS_CATEGORY[label];
    } else if (section === "Employee taxes" || section === "Company taxes") {
      category = /social security|medicare/i.test(label) ? "FICA" : "Taxes";
    } else {
      category = SECTION_CATEGORY[section];
    }
    if (!category) continue;

    const finalLabel =
      (section === "Company taxes" || section === "Company benefit contributions") &&
      !label.startsWith("Employer ")
        ? `Employer ${label}`
        : label;

    const entry: AutoEntry = {
      legacy_columns: [],
      new_columns: [header],
      category,
      label: finalLabel,
      ...(category === "Hours" ? { tolerance: 0 } : {}),
    };

    if (section === "Totals" && label === "Gross") {
      totalsGross = entry;
    } else {
      entries.push(entry);
    }
  }

  if (totalsGross) entries.push(totalsGross);

  return mergeSimilarEntries(entries);
}
