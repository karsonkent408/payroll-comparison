import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { LegacyCellEditWarningDialog } from "./LegacyCellEditWarningDialog";
import type { SourceState } from "@/features/comparisons/types";

export function SourceUploadCard({
  label,
  state,
  onFile,
  showFormatter = false,
  showCellEditWarning = false,
  onFormatFile,
  comparisonId,
  type,
}: {
  label: string;
  state: SourceState;
  onFile: (file: File) => void;
  showFormatter?: boolean;
  showCellEditWarning?: boolean;
  onFormatFile?: () => void;
  comparisonId: string;
  type: "legacy" | "new";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);

  function commitFile(file: File) {
    if (showCellEditWarning) {
      setPendingFile(file);
      setWarningOpen(true);
    } else {
      onFile(file);
    }
  }

  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) commitFile(file);
            e.target.value = "";
          }}
        />


        <Button
          variant="outline"
          size="sm"
          disabled={state.status === "uploading"}
          onClick={() => inputRef.current?.click()}
        >
          {state.status === "uploading" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {state.status === "uploading"
            ? "Uploading…"
            : state.status === "done"
            ? "Replace file"
            : "Choose file"}
        </Button>

        {showFormatter && (
          <Button
            variant="ghost"
            size="sm"
            disabled={state.status === "uploading"}
            onClick={() => onFormatFile?.()}
          >
            Format with AI
          </Button>
        )}

        {state.status === "done" && (
          <div className="text-sm">
            <p className="font-medium text-foreground truncate">{state.source.file_name}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {state.source.headers.length} columns detected
            </p>
            <a
              href={`/api/comparisons/${comparisonId}/sources/${type}/download`}
              download
              className="text-xs text-primary underline-offset-2 hover:underline mt-1 inline-block"
            >
              Download CSV
            </a>
            <div className="mt-2 flex flex-wrap gap-1">
              {state.source.headers.map((h, i) => (
                <span
                  key={i}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground break-all"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        {state.status === "error" && (
          <p className="text-destructive text-sm">{state.message}</p>
        )}

        <LegacyCellEditWarningDialog
          open={warningOpen}
          onConfirm={() => {
            setWarningOpen(false);
            if (pendingFile) onFile(pendingFile);
            setPendingFile(null);
          }}
          onCancel={() => {
            setWarningOpen(false);
            setPendingFile(null);
          }}
        />
      </CardContent>
    </Card>
  );
}
