import { useState } from "react";
import { useLoaderData, useNavigate, useParams } from "@tanstack/react-router";
import { Card } from "@/shared/components/ui/card";
import { MapColumns } from "@/features/comparisons/components/wizardComponents/MapColumns";
import { ReviewAndRun } from "@/features/comparisons/components/wizardComponents/ReviewAndRun";
import { DefineEmployeeKeys } from "@/features/comparisons/components/wizardComponents/DefineEmployeeKeys";
import { ValidateEmployees } from "@/features/comparisons/components/wizardComponents/ValidateEmployees";
import { ComparisonAPI } from "@/features/comparisons/api";
import { type QueryClient } from "@tanstack/react-query";
import { StepIndicator } from "@/features/comparisons/components/wizardComponents/StepIndicator";
import { UploadNewSource } from "@/features/comparisons/components/wizardComponents/UploadNewSource";
import { UploadLegacySource } from "@/features/comparisons/components/wizardComponents/UploadLegacySource";


const STEPS = [
  "Upload New Source",
  "Upload Legacy Source",
  "Define Employee Keys",
  "Validate Employees",
  "Map Columns & Set Tolerances",
  "Review & Run",
];

export const setupWizardLoader = (queryClient: QueryClient) =>
  async ({ params }: { params: { id: string } }) => {
    const { id } = params;
    const [sourcesResult, empMappingResult, colMappingResult] = await Promise.allSettled([
      queryClient.ensureQueryData({
        queryKey: ["comparisons", id, "sources"],
        queryFn: () => ComparisonAPI.fetchComparisonSources(id),
      }),
      queryClient.ensureQueryData({
        queryKey: ["comparisons", id, "employeeMapping"],
        queryFn: () => ComparisonAPI.fetchComparisonEmployeeMapping(id),
      }),
      queryClient.ensureQueryData({
        queryKey: ["comparisons", id, "columnMapping"],
        queryFn: () => ComparisonAPI.fetchComparisonColumnMapping(id),
      }),
    ]);

    const sources = sourcesResult.status === "fulfilled" ? sourcesResult.value : null;
    const empMapping = empMappingResult.status === "fulfilled" ? empMappingResult.value : null;
    const colMapping = colMappingResult.status === "fulfilled" ? colMappingResult.value : null;

    if (!sources?.new) return { initialStep: 0 };
    if (!sources?.legacy) return { initialStep: 1 };
    if (!empMapping) return { initialStep: 2 };
    if (!colMapping?.entries?.length) return { initialStep: 3 };
    return { initialStep: 4 };
  };


export function SetupWizard() {
  const { id } = useParams({ from: "/comparisons/$id/setup" });
  const navigate = useNavigate();
  const { initialStep } = useLoaderData({ from: "/comparisons/$id/setup" });
  const [step, setStep] = useState(initialStep);

  const stepContent = [
    <UploadNewSource
      key="upload-new"
      comparisonId={id}
      nextStep={() => setStep(step+1)}
    />,
    <UploadLegacySource
      key="upload-legacy"
      comparisonId={id}
      nextStep={() => setStep(step+1)}
      onBack={() => setStep(step-1)}
    />,
    <DefineEmployeeKeys
      key="keys"
      comparisonId={id}
      nextStep={() => setStep(step+1)}
      onBack={() => setStep(step-1)}
    />,
    <ValidateEmployees
      key="validate"
      comparisonId={id}
      nextStep={() => setStep(step+1)}
      onBack={() => setStep(step-1)}
    />,
    <MapColumns
      key="map"
      comparisonId={id}
      nextStep={() => setStep(step+1)}
      onBack={() => setStep(step-1)}
    />,
    <ReviewAndRun
      key="review"
      comparisonId={id}
      onBack={() => setStep(step-1)}
    />,
  ];

  return (
    <Card className="m-6">
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => navigate({ to: "/", search: { page: 1, filters: undefined } })}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            ← Back to list
          </button>
        </div>
        <StepIndicator steps={STEPS} current={step} />
        {stepContent[step]}
      </div>
    </Card>
  );
}
