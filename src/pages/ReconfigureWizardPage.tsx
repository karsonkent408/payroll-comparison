import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { MapColumns } from "@/features/comparisons/components/wizardComponents/MapColumns";
import { DefineEmployeeKeys } from "@/features/comparisons/components/wizardComponents/DefineEmployeeKeys";
import { ValidateEmployees } from "@/features/comparisons/components/wizardComponents/ValidateEmployees";
import { StepIndicator } from "@/features/comparisons/components/wizardComponents/StepIndicator";
import { UploadNewSource } from "@/features/comparisons/components/wizardComponents/UploadNewSource";
import { UploadLegacySource } from "@/features/comparisons/components/wizardComponents/UploadLegacySource";
import { ReviewAndRun } from "@/features/comparisons/components/wizardComponents/ReviewAndRun";
import { ResetOptions } from "@/features/comparisons/components/wizardComponents/ResetOptions";

const STEPS = [
  "Replace New Source",
  "Replace Legacy Source",
  "Define Employee Keys",
  "Validate Employees",
  "Remap Columns",
  "Reset Options",
  "Review & Run",
];

export function ReconfigureWizard() {
  const { id } = useParams({ from: "/comparisons/$id/reconfigure" });
  const navigate = useNavigate();

  const initialStep = Math.min(
    6,
    Math.max(0, Number(new URLSearchParams(window.location.search).get("step") ?? "0"))
  );

  const [step, setStep] = useState<number>(initialStep);
  const [resetStatuses, setResetStatuses] = useState(false);
  const [resetNotes, setResetNotes] = useState(false);

  function cancel() {
    navigate({ to: "/comparisons/$id/options", params: { id } });
  }

  const stepContent = [
    <UploadNewSource
      key="upload-new"
      comparisonId={id}
      nextStep={() => setStep(step + 1)}
      onBack={() => cancel()}
    />,
    <UploadLegacySource
      key="upload-legacy"
      comparisonId={id}
      nextStep={() => setStep(step + 1)}
      onBack={() => setStep(step - 1)}
      showCellEditWarning
    />,
    <DefineEmployeeKeys
      key="keys"
      comparisonId={id}
      nextStep={() => setStep(step + 1)}
      onBack={() => setStep(step - 1)}
    />,
    <ValidateEmployees
      key="validate"
      comparisonId={id}
      nextStep={() => setStep(step + 1)}
      onBack={() => setStep(step - 1)}
    />,
    <MapColumns
      key="map"
      comparisonId={id}
      nextStep={() => setStep(step + 1)}
      onBack={() => setStep(step - 1)}
    />,
    <ResetOptions
      key="reset"
      resetStatuses={resetStatuses}
      resetNotes={resetNotes}
      onResetStatusesChange={setResetStatuses}
      onResetNotesChange={setResetNotes}
      onNext={() => setStep(step + 1)}
      onBack={() => setStep(step - 1)}
    />,
    <ReviewAndRun
      key="review"
      comparisonId={id}
      onBack={() => setStep(step - 1)}
      reconfigure={{ resetStatuses, resetNotes }}
    />,
  ];

  return (
    <Card className="m-6">
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={cancel}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Cancel
          </button>
        </div>
        <StepIndicator steps={STEPS} current={step} />
        {stepContent[step]}
      </div>
    </Card>
  );
}
