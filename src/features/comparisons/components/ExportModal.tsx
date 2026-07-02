import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getExportFormats, formatSupportsDynamic, type ExportFormat, type ExportMode } from "@/lib/exportFormats";
import { authClient } from "@/lib/auth-client";

type Props = {
  open: boolean;
  onClose: () => void;
  comparisonId: number;
  comparisonLabel: string;
  payPeriodStart: string;
  payPeriodEnd: string;
};

const EXPORT_MODES: { id: ExportMode; label: string; description: string }[] = [
  { id: "static", label: "Static", description: "Hardcoded values — a frozen snapshot" },
  { id: "dynamic", label: "Dynamic", description: "Three sheets with live formulas — edit source values and differences recalculate" },
];

export function ExportModal({ open, onClose, comparisonId, comparisonLabel, payPeriodStart, payPeriodEnd }: Props) {
  const [selected, setSelected] = useState<ExportFormat["id"] | null>(null);
  const [mode, setMode] = useState<ExportMode>("static");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const formats = getExportFormats();

  function handleSelectFormat(id: ExportFormat["id"]) {
    setSelected(id);
    if (!formatSupportsDynamic(id)) setMode("static");
  }

  function handleClose() {
    setSelected(null);
    setMode("static");
    setExportError(null);
    onClose();
  }

  async function handleExport() {
    if (!selected) return;
    setExporting(true);
    try {
      if (selected === "google-sheets") {
        const sheetsParams = new URLSearchParams({ format: "sheets" });
        if (mode === "dynamic") sheetsParams.set("mode", "dynamic");
        const res = await fetch(`/api/comparisons/${comparisonId}/export?${sheetsParams.toString()}`);
        if (res.status === 403 || res.status === 401) {
          const body = await res.json() as { error: string };
          if (body.error === "scope_missing" || body.error === "token_expired") {
            await authClient.signIn.social({
              provider: "google",
              callbackURL: window.location.href,
            });
            return;
          }
        }
        if (!res.ok) {
          const body = await res.json() as { message?: string };
          setExportError(body.message ?? `Export failed (${res.status})`);
          return;
        }
        const { url } = await res.json() as { url: string };
        if (!url) {
          setExportError("Export succeeded but no URL was returned.");
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        handleClose();
        return;
      }

      const params = new URLSearchParams();
      if (selected !== "excel") params.set("format", selected);
      if (mode === "dynamic") params.set("mode", "dynamic");
      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/comparisons/${comparisonId}/export${query}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Export failed (${res.status}): ${body}`);
      }
      const blob = await res.blob();
      const ext = selected === "csv" ? "csv" : "xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${comparisonLabel} - ${payPeriodStart} to ${payPeriodEnd}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      handleClose();
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {formats.map((fmt) => (
            <button
              key={fmt.id}
              type="button"
              disabled={!fmt.enabled}
              onClick={() => handleSelectFormat(fmt.id)}
              className={[
                "flex items-center justify-between rounded-md border px-4 py-3 text-sm transition-colors",
                fmt.enabled
                  ? selected === fmt.id
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border hover:border-primary/50 text-foreground cursor-pointer"
                  : "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-60",
              ].join(" ")}
            >
              <span className="font-medium">{fmt.label}</span>
              {!fmt.enabled && (
                <span className="text-xs text-muted-foreground">Coming soon</span>
              )}
              {fmt.enabled && selected === fmt.id && (
                <span className="h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>

        <div className="border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Mode</p>
          <div className="flex flex-col gap-2">
            {EXPORT_MODES.map((m) => {
              const disabled = m.id === "dynamic" && (!selected || !formatSupportsDynamic(selected));
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMode(m.id)}
                  className={[
                    "flex items-start justify-between rounded-md border px-4 py-3 text-sm transition-colors text-left",
                    disabled
                      ? "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                      : mode === m.id
                        ? "border-primary bg-primary/5 text-foreground cursor-pointer"
                        : "border-border hover:border-primary/50 text-foreground cursor-pointer",
                  ].join(" ")}
                >
                  <div>
                    <span className="font-medium">{m.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                  </div>
                  {!disabled && mode === m.id && (
                    <span className="h-2 w-2 rounded-full bg-primary mt-1 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {exportError && (
          <p className="text-sm text-destructive">{exportError}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={exporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={selected === null || exporting}
          >
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
