import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { DatePickerNaturalLanguage } from "@/shared/components/naturalLangaugeDatePicker";
import { ComparisonMutations } from "@/features/comparisons/mutations";
import { useMutation } from "@tanstack/react-query";

export function CreateComparison() {
  const navigate = useNavigate();
  const [label, setLabel] = useState("");
  const [payPeriodStart, setPayPeriodStart] = useState("");
  const [payPeriodEnd, setPayPeriodEnd] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ label?: string; payPeriodStart?: string; payPeriodEnd?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const createComparison = useMutation(ComparisonMutations.createComparison)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const next: typeof errors = {};
    if (!label.trim()) next.label = "Label is required.";
    if (!payPeriodStart) next.payPeriodStart = "Pay period start is required.";
    if (!payPeriodEnd) next.payPeriodEnd = "Pay period end is required.";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    const input = {
      label: label.trim(),
      pay_period_start: payPeriodStart,
      pay_period_end: payPeriodEnd,
      description: description.trim()
    }

    setSubmitting(true);
    try {
      const data = await createComparison.mutateAsync(input)
      navigate({ to: "/comparisons/$id/setup", params: { id: String(data.id) } });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto max-w-lg p-8">
      <Card>
        <CardHeader>
          <CardTitle>New Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => { setLabel(e.target.value); setErrors((p) => ({ ...p, label: undefined })); }}
                aria-invalid={!!errors.label}
                placeholder="e.g. May 2025 Run"
              />
              {errors.label && <p className="text-destructive text-sm">{errors.label}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-period-start">Pay Period Start</Label>
              <DatePickerNaturalLanguage
                id="pay-period-start"
                onDateChange={(iso) => {
                  setPayPeriodStart(iso);
                  setErrors((p) => ({ ...p, payPeriodStart: undefined }));
                }}
              />
              {errors.payPeriodStart && <p className="text-destructive text-sm">{errors.payPeriodStart}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-period-end">Pay Period End</Label>
              <DatePickerNaturalLanguage
                id="pay-period-end"
                onDateChange={(iso) => {
                  setPayPeriodEnd(iso);
                  setErrors((p) => ({ ...p, payPeriodEnd: undefined }));
                }}
              />
              {errors.payPeriodEnd && <p className="text-destructive text-sm">{errors.payPeriodEnd}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if ((e.metaKey || e.ctrlKey) && e.key === "a") {
                    e.preventDefault();
                    e.currentTarget.select();
                  }
                }}
                placeholder="Any notes about this comparison run…"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Link to="/" search={{ page: 1, filters: undefined }}>
                <Button type="button" variant="ghost">Cancel</Button>
              </Link>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create Comparison"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
