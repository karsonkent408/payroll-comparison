export type ComparisonStatus = "setup" | "pass" | "fail" | "in_progress";

const styles: Record<ComparisonStatus, string> = {
  setup: "bg-muted text-muted-foreground border border-border",
  pass: "bg-green-100 text-green-800 border border-green-200",
  fail: "bg-red-100 text-red-800 border border-red-200",
  in_progress: "bg-amber-100 text-amber-800 border border-amber-200",
};

const labels: Record<ComparisonStatus, string> = {
  setup: "Setup",
  pass: "Pass",
  fail: "Fail",
  in_progress: "In Progress",
};

export function StatusBadge({ status }: { status: ComparisonStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
