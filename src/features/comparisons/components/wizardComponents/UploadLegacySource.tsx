import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { SourceFormatterModal } from "./SourceFormatterModal";
import { SourceUploadCard } from "./SourceUploadCard";
import { formattedCsvFilename } from "@/shared/lib/formattedCsvFilename";
import { ComparisonQueries } from "../../query";
import { useMutation } from "@tanstack/react-query";
import { ComparisonMutations } from "../../mutations";
import type { SourceState } from "@/features/comparisons/types";
import type { FormatterConfirmContext } from "./SourceFormatterModal";

export function UploadLegacySource({
  comparisonId,
  nextStep,
  onBack,
  showCellEditWarning = false,
}: {
  comparisonId: string;
  nextStep: () => void;
  onBack?: () => void;
  showCellEditWarning?: boolean;
}) {
  const { isPending, isError, data: sources, error } = ComparisonQueries.useComparisonSources(comparisonId);
  const { data: comparison } = ComparisonQueries.useComparison(comparisonId);
  const legacySource: SourceState = sources?.legacy ? { status: "done", source: sources.legacy } : { status: "idle" };
  const [uploadedLegacy, setUploadedLegacy] = useState<SourceState>({ status: "idle" });
  const legacy = uploadedLegacy.status !== "idle" ? uploadedLegacy : legacySource;

  const [formatterOpen, setFormatterOpen] = useState(false);

  const uploadSource = useMutation(ComparisonMutations.uploadSource);

  if (isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm font-medium text-destructive">Failed to load sources</p>
        <p className="text-xs text-muted-foreground">{error?.message ?? "An unexpected error occurred."}</p>
      </div>
    );
  }

  async function upload(file: File, context?: { legacy_provider?: string; format_notes?: string; expected_employee_count?: number }) {
    setUploadedLegacy({ status: "uploading" });
    try {
      const source = await uploadSource.mutateAsync({ id: comparisonId, type: "legacy", file, ...context });
      setUploadedLegacy({ status: "done", source });
    } catch (err) {
      setUploadedLegacy({ status: "error", message: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  async function handleLegacyFormatConfirm(csv: string, filename: string, context: FormatterConfirmContext) {
    const blob = new Blob([csv], { type: "text/csv" });
    const name = formattedCsvFilename(filename);
    const file = new File([blob], name, { type: "text/csv" });
    setFormatterOpen(false);
    await upload(file, {
      legacy_provider: context.provider,
      ...(context.notes ? { format_notes: context.notes } : {}),
      ...(context.employeeCount !== undefined ? { expected_employee_count: context.employeeCount } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <SourceUploadCard
        label="Legacy Source"
        state={legacy}
        onFile={upload}
        showFormatter
        showCellEditWarning={showCellEditWarning}
        onFormatFile={() => setFormatterOpen(true)}
        comparisonId={comparisonId}
        type="legacy"
      />
      {formatterOpen && (
        <SourceFormatterModal
          open={formatterOpen}
          onClose={() => setFormatterOpen(false)}
          onConfirm={handleLegacyFormatConfirm}
          initialProvider={sources?.legacy?.legacy_provider ?? undefined}
          initialNotes={sources?.legacy?.format_notes ?? undefined}
          initialEmployeeCount={comparison?.expected_employee_count != null ? String(comparison.expected_employee_count) : undefined}
        />
      )}
      <div className="flex justify-between">
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>Back</Button>
        ) : <span />}
        <Button onClick={nextStep} disabled={legacy.status !== "done"}>
          Next
        </Button>
      </div>
    </div>
  );
}
