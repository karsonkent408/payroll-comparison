import { Button } from "@/components/ui/button";

export function ResetOptions({
  resetStatuses,
  resetNotes,
  onResetStatusesChange,
  onResetNotesChange,
  onNext,
  onBack,
}: {
  resetStatuses: boolean;
  resetNotes: boolean;
  onResetStatusesChange: (v: boolean) => void;
  onResetNotesChange: (v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Choose what to reset for MappingEntries whose column sets are unchanged.
        Entries whose columns changed always start fresh.
      </p>

      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/30">
          <input
            type="checkbox"
            checked={resetStatuses}
            onChange={(e) => onResetStatusesChange(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium">Reset resolution statuses</p>
            <p className="text-sm text-muted-foreground">
              Clears all manual overrides on preserved entries. Auto-statuses are always
              recomputed from the new results.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/30">
          <input
            type="checkbox"
            checked={resetNotes}
            onChange={(e) => onResetNotesChange(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium">Reset notes</p>
            <p className="text-sm text-muted-foreground">
              Clears all notes on preserved entries.
            </p>
          </div>
        </label>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext}>Next</Button>
      </div>
    </div>
  );
}
