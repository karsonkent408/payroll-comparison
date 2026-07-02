import { Sigma } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/shared/components/ui/hover-card";

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

interface Props {
  breakdown: Record<string, number> | null;
  side: "Legacy" | "New";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ColumnBreakdownHoverCard({ breakdown, side, open, onOpenChange }: Props) {
  if (!breakdown || Object.keys(breakdown).length <= 1) return null;

  return (
    <HoverCard open={open} onOpenChange={onOpenChange}>
      <HoverCardTrigger asChild>
        <button
          aria-label={`${side} breakdown`}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground"
        >
          <Sigma className="h-3 w-3" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-56">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{side} breakdown</p>
          {Object.entries(breakdown).map(([col, val]) => (
            <div key={col} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{col}</span>
              <span className="text-xs font-mono">{usdFormatter.format(val)}</span>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
