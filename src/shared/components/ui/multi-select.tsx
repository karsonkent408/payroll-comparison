import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  function toggle(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((o) => !o); }}
          className={cn(
            "flex min-h-9 w-full cursor-pointer items-start justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <span className="flex flex-wrap gap-1 text-left py-0.5">
            {value.length === 0 ? (
              <span className="text-muted-foreground leading-6">{placeholder}</span>
            ) : (
              value.map((v) => {
                const absent = !options.includes(v);
                return (
                  <span
                    key={v}
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-mono leading-none",
                      absent ? "bg-amber-100 text-amber-700" : "bg-muted"
                    )}
                  >
                    {v}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== v)); }}
                      className="ml-0.5 text-muted-foreground hover:text-foreground leading-none"
                      aria-label={`Remove ${v}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })
            )}
          </span>
          <ChevronDown className="ml-2 mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-2">
        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
          {options.map((option) => {
            const checked = value.includes(option);
            return (
              <label
                key={option}
                className="flex items-start gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option)}
                  className="accent-primary mt-0.5 shrink-0"
                />
                <span className="font-mono break-all">{option}</span>
              </label>
            );
          })}
          {options.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No options</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
