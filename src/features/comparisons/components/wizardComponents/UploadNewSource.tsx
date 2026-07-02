import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { SourceUploadCard } from "./SourceUploadCard";
import { ComparisonQueries } from "../../query";
import { useMutation } from "@tanstack/react-query";
import { ComparisonMutations } from "../../mutations";
import type { SourceState } from "@/features/comparisons/types";

export function UploadNewSource({
  comparisonId,
  nextStep,
  onBack,
}: {
  comparisonId: string;
  nextStep: () => void;
  onBack?: () => void;
}) {
  const { isPending, isError, data: sources, error } = ComparisonQueries.useComparisonSources(comparisonId);
  const existingSource: SourceState = sources?.new ? { status: "done", source: sources.new } : { status: "idle" };
  const [uploadedNew, setUploadedNew] = useState<SourceState>({ status: "idle" });
  const newState = uploadedNew.status !== "idle" ? uploadedNew : existingSource;

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

  async function upload(file: File) {
    setUploadedNew({ status: "uploading" });
    try {
      const source = await uploadSource.mutateAsync({ id: comparisonId, type: "new", file });
      setUploadedNew({ status: "done", source });
    } catch (err) {
      setUploadedNew({ status: "error", message: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SourceUploadCard
        label="New Source"
        state={newState}
        onFile={upload}
        comparisonId={comparisonId}
        type="new"
      />
      <div className="flex justify-between">
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>Cancel</Button>
        ) : <span />}
        <Button onClick={nextStep} disabled={newState.status !== "done"}>
          Next
        </Button>
      </div>
    </div>
  );
}
