import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { ComparisonQueries } from "@/features/comparisons/query";
import { ComparisonMutations } from "@/features/comparisons/mutations";
import type { RoomMessage } from "@/shared/lib/types";

type EntryResult = {
  column_entry_id: string;
  legacy_value: number;
  new_value: number;
  difference: number;
  auto_status: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparisonId: string;
  employeeKey: string;
  legacyColumns: string[];
  discrepancyId?: number;
  onSaved: (results: EntryResult[]) => void;
  children?: React.ReactNode;
  send?: (message: RoomMessage) => void;
  userId?: string;
  entryId?: number;
}

const MANUAL_VALUE_KEY = "__manual__";

export function CellEditPopover({
  open,
  onOpenChange,
  comparisonId,
  employeeKey,
  legacyColumns,
  discrepancyId,
  onSaved,
  children,
  send,
  userId,
  entryId,
}: Props) {
  const isManual = legacyColumns.length === 0;
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !send || entryId === undefined || !userId) return;
    send({ type: "entry_focus", entryId, userId });
    return () => {
      send({ type: "entry_blur", entryId, userId });
    };
  }, [open]);

  const { data: sourceRow } = ComparisonQueries.useLegacySourceRow(comparisonId, employeeKey, {
    enabled: open && !isManual,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) { setValues({}); return; }
    if (isManual || !sourceRow) return;
    const initial: Record<string, string> = {};
    for (const col of legacyColumns) initial[col] = (sourceRow as Record<string, string>)[col] ?? "";
    setValues(initial);
  }, [open, sourceRow]);

  const patchMappingEntry = useMutation(ComparisonMutations.patchMappingEntry);
  const patchSourceCells = useMutation(ComparisonMutations.patchLegacySourceCells);
  const saving = patchMappingEntry.isPending || patchSourceCells.isPending;

  async function handleSave() {
    setError(null);
    try {
      if (isManual) {
        const rawValue = values[MANUAL_VALUE_KEY] ?? "0";
        const updated = await patchMappingEntry.mutateAsync({
          id: comparisonId,
          mappingEntryId: String(discrepancyId),
          legacy_value: parseFloat(rawValue) || 0,
        });
        onSaved([updated]);
      } else {
        let lastResults: EntryResult[] = [];
        for (const col of legacyColumns) {
          const data = await patchSourceCells.mutateAsync({
            id: comparisonId,
            employeeKey,
            columnName: col,
            value: values[col] ?? "",
          });
          lastResults = (data as { results: EntryResult[] }).results;
        }
        onSaved(lastResults);
      }
      onOpenChange(false);
    } catch {
      setError("Save failed. Please try again.");
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children && <PopoverTrigger asChild>{children}</PopoverTrigger>}
      <PopoverContent className="w-80">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Edit Legacy values</p>
          {isManual ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Value</label>
              <Input
                value={values[MANUAL_VALUE_KEY] ?? ""}
                onChange={(e) => setValues({ [MANUAL_VALUE_KEY]: e.target.value })}
                placeholder="0"
                className="h-7 text-xs font-mono"
              />
            </div>
          ) : (
            legacyColumns.map((col) => (
              <div key={col} className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{col}</label>
                <Input
                  value={values[col] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [col]: e.target.value }))}
                  className="h-7 text-xs font-mono"
                />
              </div>
            ))
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
