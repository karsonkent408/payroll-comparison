import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";

export type ComparisonFilter = {
  field: "label" | "pay_period_start" | "pay_period_end" | "status" | "owner";
  operator: string;
  value: string | string[];
};

type DraftRow = {
  id: number;
  field: string;
  operator: string;
  value: string | string[];
};

type UserOption = { id: string; name: string | null; email: string };

const ALL_FIELDS = [
  { value: "label", label: "Label" },
  { value: "pay_period_start", label: "Pay Period Start" },
  { value: "pay_period_end", label: "Pay Period End" },
  { value: "status", label: "Status" },
  { value: "owner", label: "Owner" },
] as const;

const OPERATORS: Record<string, string[]> = {
  label: ["is", "is not", "contains", "does not contain"],
  pay_period_start: ["is", "is not", "is before", "is after", "is between"],
  pay_period_end: ["is", "is not", "is before", "is after", "is between"],
  status: ["is", "is not", "is one of", "is not one of"],
  owner: ["is", "is not"],
};

const STATUS_OPTIONS = ["setup", "in_progress", "pass", "fail"];

let _nextId = 0;
function newRow(): DraftRow {
  return { id: ++_nextId, field: "", operator: "", value: "" };
}

function isComplete(row: DraftRow): boolean {
  if (!row.field || !row.operator) return false;
  if (row.operator === "is between") {
    const v = row.value as string[];
    return Array.isArray(v) && v[0] !== "" && v[1] !== "";
  }
  if (Array.isArray(row.value)) return row.value.length > 0;
  return String(row.value).trim() !== "";
}

function defaultValueFor(operator: string): string | string[] {
  if (operator === "is one of" || operator === "is not one of") return [];
  if (operator === "is between") return ["", ""];
  return "";
}

function ValueInput({
  row,
  onChange,
  users,
  currentUserId,
}: {
  row: DraftRow;
  onChange: (val: string | string[]) => void;
  users: UserOption[];
  currentUserId: string | null;
}) {
  if (!row.field || !row.operator) {
    return <div className="flex-1" />;
  }

  const isDateField = row.field === "pay_period_start" || row.field === "pay_period_end";

  if (row.field === "status" && (row.operator === "is one of" || row.operator === "is not one of")) {
    return (
      <div className="flex-1">
        <MultiSelect
          options={STATUS_OPTIONS}
          value={Array.isArray(row.value) ? row.value : []}
          onChange={onChange}
          placeholder="Select statuses…"
        />
      </div>
    );
  }

  if (row.operator === "is between") {
    const v = Array.isArray(row.value) ? (row.value as string[]) : ["", ""];
    return (
      <div className="flex flex-1 items-center gap-1">
        <input
          type="date"
          value={v[0] ?? ""}
          onChange={(e) => onChange([e.target.value, v[1] ?? ""])}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground shrink-0">to</span>
        <input
          type="date"
          value={v[1] ?? ""}
          onChange={(e) => onChange([v[0] ?? "", e.target.value])}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    );
  }

  if (row.field === "owner") {
    const sorted = users
      .filter((u) => u.id !== currentUserId)
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
    return (
      <select
        value={Array.isArray(row.value) ? "" : String(row.value)}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">User…</option>
        {currentUserId && <option value={currentUserId}>Me</option>}
        {sorted.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name ?? u.email}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={isDateField ? "date" : "text"}
      value={Array.isArray(row.value) ? "" : String(row.value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value…"
      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

export function FilterPopover({
  filters,
  onApply,
  currentUserId = null,
}: {
  filters: ComparisonFilter[];
  onApply: (filters: ComparisonFilter[]) => void;
  currentUserId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftRow[]>([newRow()]);
  const [users, setUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(
        filters.length > 0
          ? filters.map((f) => ({ id: ++_nextId, ...f }))
          : [newRow()]
      );
      fetch("/api/users")
        .then((r) => r.json())
        .then((data) => setUsers(data as UserOption[]))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const usedFields = new Set(draft.map((r) => r.field).filter(Boolean));
  const allFieldsUsed = usedFields.size >= ALL_FIELDS.length;

  function updateRow(id: number, patch: Partial<DraftRow>) {
    setDraft((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        if (patch.field !== undefined && patch.field !== r.field) {
          updated.operator = "";
          updated.value = "";
        }
        if (patch.operator !== undefined && patch.operator !== r.operator) {
          updated.value = defaultValueFor(patch.operator);
        }
        return updated;
      })
    );
  }

  function removeRow(id: number) {
    setDraft((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [newRow()];
    });
  }

  function handleApply() {
    const complete = draft
      .filter(isComplete)
      .map(({ field, operator, value }) => ({ field, operator, value })) as ComparisonFilter[];
    onApply(complete);
    setOpen(false);
  }

  function handleClearAll() {
    onApply([]);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {filters.length > 0 && (
            <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 leading-none">
              {filters.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[540px] p-4">
        <div className="flex flex-col gap-3">
          {draft.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <select
                value={row.field}
                onChange={(e) => updateRow(row.id, { field: e.target.value })}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Field…</option>
                {ALL_FIELDS.map((f) => (
                  <option
                    key={f.value}
                    value={f.value}
                    disabled={usedFields.has(f.value) && f.value !== row.field}
                  >
                    {f.label}
                  </option>
                ))}
              </select>

              <select
                value={row.operator}
                disabled={!row.field}
                onChange={(e) => updateRow(row.id, { operator: e.target.value })}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Operator…</option>
                {row.field &&
                  OPERATORS[row.field]?.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
              </select>

              <ValueInput
                row={row}
                onChange={(val) => updateRow(row.id, { value: val })}
                users={users}
                currentUserId={currentUserId}
              />

              <button
                type="button"
                onClick={() => removeRow(row.id)}
                aria-label="Remove filter row"
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          <button
            type="button"
            disabled={allFieldsUsed}
            onClick={() => setDraft((prev) => [...prev, newRow()])}
            className="text-xs text-primary hover:underline text-left w-fit disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
          >
            + Add filter
          </button>

          <div className="flex items-center justify-between border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-muted-foreground"
            >
              Clear all
            </Button>
            <Button size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
