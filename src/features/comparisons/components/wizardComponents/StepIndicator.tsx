

export function StepIndicator({ steps, current }: { steps: string[],current: number }) {
  return (
    <ol className="flex items-center justify-center gap-0 mb-8">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-xs font-medium ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-0.5 w-16 mx-2 mb-4 ${
                  done ? "bg-primary" : "bg-muted-foreground/20"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
