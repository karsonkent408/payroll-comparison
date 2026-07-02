import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation } from "@tanstack/react-query";
import { ComparisonMutations } from '@/features/comparisons/mutations'
import { ComparisonQueries } from "@/features/comparisons/query";
import { listUnmappedColumns } from "@/shared/lib/unmappedColumns";
import { computeEmployeeSummary } from "@/features/comparisons/components/employeeSummary";
import { normalizeEmployeeKey } from "@/lib/normalizeEmployeeKey";

interface ReviewAndRunProps {
  comparisonId: string;
  onBack?: () => void;
  reconfigure?: {
    resetStatuses: boolean;
    resetNotes: boolean;
  };
}

export function ReviewAndRun({ comparisonId, onBack, reconfigure }: ReviewAndRunProps) {
  const navigate = useNavigate();
  const { isPending: sourcesIsPending, data: sources } = ComparisonQueries.useComparisonSources(comparisonId);
  const { isPending: columnMappingIsPending, data: columnMapping } = ComparisonQueries.useComparisonColumnMapping(comparisonId);
  const { isPending: empMappingIsPending, data: empMapping } = ComparisonQueries.useComparisonEmployeeMapping(comparisonId);
  const { isPending: empPairIsPending, data: empPairs } = ComparisonQueries.useComparisonEmployeePair(comparisonId);
  const { isPending: legacyEmployeesIsPending, data: legacyEmployees } = ComparisonQueries.useComparisonSourceEmployees(comparisonId, "legacy");
  const { isPending: newEmployeesIsPending, data: newEmployees } = ComparisonQueries.useComparisonSourceEmployees(comparisonId, "new");
  const entries = columnMapping?.entries ?? [];
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPending = sourcesIsPending || columnMappingIsPending || empMappingIsPending || empPairIsPending || legacyEmployeesIsPending || newEmployeesIsPending;
  const runComparison = useMutation(ComparisonMutations.runComparison);
  const reconfigureMutation = useMutation(ComparisonMutations.reconfigure);

  const { unmappedLegacy, unmappedNew } = listUnmappedColumns(
    sources?.legacy?.headers ?? [],
    sources?.new?.headers ?? [],
    entries,
    empMapping?.legacy_employee_key ?? [],
    empMapping?.new_employee_key ?? [],
    empMapping?.new_first_name_column ?? null,
    empMapping?.new_last_name_column ?? null,
  );

  const mapping = {
    activeCount: entries.length,
    unmappedLegacy: unmappedLegacy.length,
    unmappedNew: unmappedNew.length,
    warnings: [] as string[],
  };

  const legacyKeys = legacyEmployees?.map((e) => e.key) ?? [];
  const newKeys = newEmployees?.map((e) => e.key) ?? [];

  const normalizedNewKeyMap = new Map(newKeys.map((k) => [normalizeEmployeeKey(k), k]));
  const exactMatchPairs = legacyKeys.flatMap((k) => {
    const newKey = normalizedNewKeyMap.get(normalizeEmployeeKey(k));
    return newKey !== undefined ? [{ legacy_key: k, new_key: newKey }] : [];
  });

  const dbPairs = (empPairs ?? []).flatMap((p) =>
    p.legacy_key !== null && p.new_key !== null
      ? [{ legacy_key: p.legacy_key, new_key: p.new_key }]
      : []
  );

  const dbPairedLegacyKeys = new Set(dbPairs.map((p) => p.legacy_key));
  const employeeSummary = computeEmployeeSummary(
    legacyKeys,
    newKeys,
    [...exactMatchPairs.filter((p) => !dbPairedLegacyKeys.has(p.legacy_key)), ...dbPairs],
  );

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      await runComparison.mutateAsync({ id: comparisonId });
      navigate({ to: "/comparisons/$id", params: { id: comparisonId }, search: { message: undefined } });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  async function handleCommit() {
    if (!empMapping || !reconfigure) return;
    setRunning(true);
    setError(null);
    try {
      await reconfigureMutation.mutateAsync({
        id: comparisonId,
        mapping: {
          legacy_employee_key: empMapping.legacy_employee_key,
          new_employee_key: empMapping.new_employee_key,
          employee_match_mode: empMapping.employee_match_mode ?? "exact",
          new_first_name_column: empMapping.new_first_name_column ?? null,
          new_last_name_column: empMapping.new_last_name_column ?? null,
          entries: entries.map((e) => ({
            legacy_columns: e.legacy_columns,
            new_columns: e.new_columns,
            tolerance: e.tolerance,
            category: e.category,
            label: e.label,
            display_order: e.display_order,
          })),
        },
        resetStatuses: reconfigure.resetStatuses,
        resetNotes: reconfigure.resetNotes,
      });
      navigate({ to: "/comparisons/$id", params: { id: comparisonId }, search: { message: undefined } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconfigure failed. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  if (isPending) {
    return <ReviewAndRunSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sources */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Legacy Source", info: sources?.legacy },
          { label: "New Source", info: sources?.new },
        ].map(({ label, info }) => (
          <div key={label} className="rounded-lg border p-4 flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-sm font-medium truncate">{info?.file_name}</p>
            <p className="text-xs text-muted-foreground">{info?.row_count?.toLocaleString()} rows</p>
          </div>
        ))}
      </div>

      {/* Employee summary */}
      <div className="rounded-lg border p-4 flex gap-8">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Matched Employees</p>
          <p className="text-2xl font-bold">{employeeSummary.matched}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Skipped</p>
          <p className="text-sm font-medium text-muted-foreground">
            {employeeSummary.skippedLegacy} legacy / {employeeSummary.skippedNew} new
          </p>
        </div>
      </div>

      {/* Mapping summary */}
      <div className="rounded-lg border p-4 flex gap-8">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Entries</p>
          <p className="text-2xl font-bold">{mapping.activeCount}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unmapped Columns</p>
          <p className="text-sm font-medium text-muted-foreground">
            Legacy: {mapping.unmappedLegacy} / New: {mapping.unmappedNew}
          </p>
        </div>
      </div>

      {/* Reset flags (reconfigure only) */}
      {reconfigure && (reconfigure.resetStatuses || reconfigure.resetNotes) && (
        <div className="rounded-lg border p-4 flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Also resetting</p>
          <ul className="text-sm list-disc list-inside text-muted-foreground">
            {reconfigure.resetStatuses && <li>Resolution statuses</li>}
            {reconfigure.resetNotes && <li>Notes</li>}
          </ul>
        </div>
      )}

      {/* Type mismatch warnings */}
      {mapping.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 flex flex-col gap-2">
          <p className="text-sm font-medium text-amber-800">Type mismatch warnings</p>
          <ul className="flex flex-col gap-1">
            {mapping.warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-700">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between">
        {onBack ? (
          <Button variant="outline" onClick={onBack} disabled={running}>Back</Button>
        ) : <span />}
        <Button onClick={reconfigure ? handleCommit : handleRun} disabled={running}>
          {running
            ? (reconfigure ? "Saving…" : "Running…")
            : (reconfigure ? "Save & Run" : "Run Comparison")}
        </Button>
      </div>
    </div>
  );
}

function ReviewAndRunSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border p-4 flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border p-4 flex gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-10" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="rounded-lg border p-4 flex gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-10" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
  );
}
