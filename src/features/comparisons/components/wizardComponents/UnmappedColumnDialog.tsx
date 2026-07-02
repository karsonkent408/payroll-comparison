import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  unmappedLegacy: string[];
  unmappedNew: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function UnmappedColumnDialog({ unmappedLegacy, unmappedNew, onConfirm, onCancel }: Props) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent showCloseButton={false} className="flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Unmapped Columns</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          The following columns are not assigned to any mapping entry. Review them before continuing.
        </p>

        <div className="flex flex-col gap-4 overflow-y-auto">
          {unmappedLegacy.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Legacy</p>
              {unmappedLegacy.map((col) => (
                <p key={col} className="text-sm">{col}</p>
              ))}
            </div>
          )}

          {unmappedNew.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">New</p>
              {unmappedNew.map((col) => (
                <p key={col} className="text-sm">{col}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>
            Acknowledge & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
