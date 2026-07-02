import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LegacyCellEditWarningDialog({ open, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Replace Legacy source?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Any inline cell edits you have made to the Legacy source will be permanently lost.
          Are you sure you want to replace it?
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Replace anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
