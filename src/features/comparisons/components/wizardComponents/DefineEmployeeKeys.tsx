import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EmployeeMatchMode } from "@/lib/types";
import { ComparisonQueries } from "@/features/comparisons/query";
import { useMutation } from "@tanstack/react-query";
import { ComparisonMutations } from "@/features/comparisons/mutations";

export type EmployeeKeysConfig = {
  legacyKeys: string[];
  newKeys: string[];
  newFirstNameColumn: string | null;
  newLastNameColumn: string | null;
  matchMode: EmployeeMatchMode;
};

interface DefineEmployeeKeysProps {
  comparisonId: string;
  nextStep: () => void;
  onBack: () => void;
}


const NO_COLUMN = "__none__";

const DEFAULT_EMPLOYEE_KEYS: EmployeeKeysConfig = {
  legacyKeys: [],
  newKeys: ["Employee ID"],
  newFirstNameColumn: "Employee First name",
  newLastNameColumn: "Employee Last name",
  matchMode: "exact",
};


export function DefineEmployeeKeys({
  comparisonId,
  nextStep,
  onBack,
}: DefineEmployeeKeysProps) {
  const upsertEmployeeMapping = useMutation(ComparisonMutations.upsertEmployeeMapping)
  const { isPending: sourcesIsPending, data: sources, error: sourcesError } = ComparisonQueries.useComparisonSources(comparisonId)
  const { isPending: empMappingIsPending, data: empMapping, error: empMappingError} = ComparisonQueries.useComparisonEmployeeMapping(comparisonId)
  const legacyHeaders = sources?.legacy?.headers ?? []
  const newHeaders = sources?.new?.headers ?? []
  const initialLegacyKeys = empMapping?.legacy_employee_key ?? DEFAULT_EMPLOYEE_KEYS.legacyKeys
  const initialNewKeys = empMapping?.new_employee_key ?? DEFAULT_EMPLOYEE_KEYS.newKeys
  const initialNewFirstNameColumn = empMapping?.new_first_name_column ?? DEFAULT_EMPLOYEE_KEYS.newFirstNameColumn
  const initialNewLastNameColumn = empMapping?.new_last_name_column ?? DEFAULT_EMPLOYEE_KEYS.newLastNameColumn
  const initialMatchMode = empMapping?.employee_match_mode ?? DEFAULT_EMPLOYEE_KEYS.matchMode

  const [updatedLegacyKeys, setUpdatedLegacyKeys] = useState<string[] | null>(null)
  const [updatedNewKeys, setUpdatedNewKeys] = useState<string[] | null>(null)
  const [updatedNewFirstNameColumn, setUpdatedNewFirstNameColumn] = useState<string | null | undefined>(undefined)
  const [updatedNewLastNameColumn, setUpdatedNewLastNameColumn] = useState<string | null | undefined>(undefined)
  const [updatedMatchMode, setUpdatedMatchMode] = useState<EmployeeMatchMode | null>(null)

  const matchMode: EmployeeMatchMode = updatedMatchMode ?? initialMatchMode
  const legacyKeys = updatedLegacyKeys ?? initialLegacyKeys
  const newKeys = updatedNewKeys ?? initialNewKeys
  const rawFirstName = updatedNewFirstNameColumn !== undefined ? updatedNewFirstNameColumn : initialNewFirstNameColumn
  const rawLastName = updatedNewLastNameColumn !== undefined ? updatedNewLastNameColumn : initialNewLastNameColumn
  const newFirstNameColumn = rawFirstName && newHeaders.includes(rawFirstName) ? rawFirstName : null
  const newLastNameColumn = rawLastName && newHeaders.includes(rawLastName) ? rawLastName : null

  async function handleNext() {
    const mappingInput = {
      legacy_employee_key: legacyKeys,
      new_employee_key: newKeys,
      new_first_name_column: newFirstNameColumn,
      new_last_name_column: newLastNameColumn,
      employee_match_mode: matchMode
    }

    await upsertEmployeeMapping.mutateAsync({ id: comparisonId, ...mappingInput})
    nextStep()
  }

  const canProceed = legacyKeys.length > 0 && newKeys.length > 0 && !upsertEmployeeMapping.isPending;

  if (sourcesIsPending || empMappingIsPending) {
    return (
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-16" />
        </div>
      </div>
    );
  }

  if (sourcesError || empMappingError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm font-medium text-destructive">Failed to load employee key configuration</p>
        <p className="text-xs text-muted-foreground">
          {(sourcesError ?? empMappingError)?.message ?? "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-4 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Legacy Employee Key</Label>
          <MultiSelect
            options={legacyHeaders}
            value={legacyKeys}
            onChange={setUpdatedLegacyKeys}
            placeholder="Select columns…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>New Employee Key</Label>
          <MultiSelect
            options={newHeaders}
            value={newKeys}
            onChange={setUpdatedNewKeys}
            placeholder="Select columns…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-first-name-col">New First Name (optional)</Label>
          <Select
            value={newFirstNameColumn ?? ""}
            onValueChange={(v) => {
              setUpdatedNewFirstNameColumn(v === NO_COLUMN ? null : v);
            }}
          >
            <SelectTrigger id="new-first-name-col" className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COLUMN}>None</SelectItem>
              {newHeaders.map((h) => (
                <SelectItem key={h} value={h} className="font-mono">{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-last-name-col">New Last Name (optional)</Label>
          <Select
            value={newLastNameColumn ?? ""}
            onValueChange={(v) => {
              setUpdatedNewLastNameColumn(v === NO_COLUMN ? null : v);
            }}
          >
            <SelectTrigger id="new-last-name-col" className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COLUMN}>None</SelectItem>
              {newHeaders.map((h) => (
                <SelectItem key={h} value={h} className="font-mono">{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Employee Match Mode</Label>
        <div className="flex gap-2">
          {(["exact", "fuzzy"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setUpdatedMatchMode(mode)}
              className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                matchMode === mode
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent text-foreground hover:bg-muted"
              }`}
            >
              {mode === "exact" ? "Exact" : "Fuzzy"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {matchMode === "exact"
            ? "Rows are paired only when the employee key values match exactly."
            : "Rows are proposed as fuzzy candidates based on token overlap and must be validated before the comparison runs."}
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={handleNext} disabled={!canProceed}>
          {upsertEmployeeMapping.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Next
        </Button>
      </div>
    </div>
  );
}
