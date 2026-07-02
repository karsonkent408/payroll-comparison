import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formattedCsvFilename } from "@/lib/formattedCsvFilename";

type PreviewData = {
  csv: string;
  headers: string[];
  rows: Record<string, string>[];
};

type State =
  | { status: "collecting_context" }
  | { status: "formatting" }
  | { status: "needs_input"; questions: string[] }
  | { status: "preview"; data: PreviewData }
  | { status: "error"; message: string }
  | { status: "refining"; data: PreviewData }
  | { status: "confirming"; data: PreviewData }
  | { status: "confirm_error"; data: PreviewData; message: string };

type ChatMessage = { instruction: string; outcome: "ok" | "error"; detail?: string };

export type FormatterConfirmContext = {
  provider: string;
  employeeCount?: number;
  notes?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (csv: string, filename: string, context: FormatterConfirmContext) => Promise<void>;
  initialProvider?: string;
  initialEmployeeCount?: string;
  initialNotes?: string;
};

const PREVIEW_ROWS = 10;

async function consumeFormatSSE(
  response: Response,
  onThinking: (delta: string) => void,
): Promise<Record<string, unknown>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === "thinking" && typeof event.text === "string") {
          onThinking(event.text);
        } else if (event.type === "result") {
          return event;
        } else if (event.type === "error") {
          throw new Error(typeof event.error === "string" ? event.error : "Formatting failed.");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error("Formatting failed: stream ended without a result.");
}

export function SourceFormatterModal({ open, onClose, onConfirm, initialProvider, initialEmployeeCount, initialNotes }: Props) {
  const [state, setState] = useState<State>({ status: "collecting_context" });
  const [file, setFile] = useState<File | null>(null);
  const [provider, setProvider] = useState(initialProvider ?? "");
  const [employeeCount, setEmployeeCount] = useState(initialEmployeeCount ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [flags, setFlags] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [instruction, setInstruction] = useState("");
  const [answers, setAnswers] = useState("");
  const [needsInputResponse, setNeedsInputResponse] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thinkingRef.current && state.status === "formatting") {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingText, state.status]);

  function handleClose() {
    if (state.status === "confirming") return;
    abortControllerRef.current?.abort();
    setState({ status: "collecting_context" });
    setFile(null);
    setProvider("");
    setEmployeeCount("");
    setNotes("");
    setFlags([]);
    setMessages([]);
    setInstruction("");
    setAnswers("");
    setNeedsInputResponse(null);
    onClose();
  }

  async function handleFormat(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !provider.trim()) return;
    setState({ status: "formatting" });
    setThinkingText("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const form = new FormData();
    form.append("file", file);
    form.append("provider", provider.trim());
    if (employeeCount) form.append("employeeCount", employeeCount);
    if (notes.trim()) form.append("notes", notes.trim());

    try {
      const res = await fetch("/api/ai-format/source", { method: "POST", body: form, signal: controller.signal });
      if (!res.ok) {
        const body: { error?: string } = await res.json();
        setState({ status: "error", message: body.error ?? "Formatting failed." });
        return;
      }
      const event = await consumeFormatSSE(res, (delta) => setThinkingText((prev) => prev + delta));
      if (event.status === "needs_input") {
        const { type: _sseType, ...responseBody } = event;
        void _sseType;
        setNeedsInputResponse(JSON.stringify(responseBody));
        setState({ status: "needs_input", questions: event.questions as string[] });
      } else {
        setFlags(Array.isArray(event.flags) ? (event.flags as string[]) : []);
        setState({ status: "preview", data: { csv: event.csv as string, headers: event.headers as string[], rows: event.rows as Record<string, string>[] } });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState({ status: "error", message: err instanceof Error ? err.message : "Network error. Please try again." });
    } finally {
      abortControllerRef.current = null;
    }
  }

  async function handleConfirm() {
    const data = currentData();
    if (!data || !file) return;

    setState({ status: "confirming", data });
    const context: FormatterConfirmContext = {
      provider,
      ...(employeeCount ? { employeeCount: Number(employeeCount) } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try {
      await onConfirm(data.csv, file.name, context);
    } catch (err) {
      setState({
        status: "confirm_error",
        data,
        message: err instanceof Error ? err.message : "Failed to save. Please try again.",
      });
    }
  }

  async function handleRetry(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !needsInputResponse || !answers.trim()) return;

    setState({ status: "formatting" });
    setThinkingText("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const form = new FormData();
    form.append("file", file);
    form.append("priorResponse", needsInputResponse);
    form.append("answers", answers.trim());
    form.append("provider", provider.trim());
    if (employeeCount) form.append("employeeCount", employeeCount);
    if (notes.trim()) form.append("notes", notes.trim());

    try {
      const res = await fetch("/api/ai-format/source", { method: "POST", body: form, signal: controller.signal });
      if (!res.ok) {
        const body: { error?: string } = await res.json();
        setState({ status: "error", message: body.error ?? "Formatting failed." });
        return;
      }
      const event = await consumeFormatSSE(res, (delta) => setThinkingText((prev) => prev + delta));
      setFlags(Array.isArray(event.flags) ? (event.flags as string[]) : []);
      setState({ status: "preview", data: { csv: event.csv as string, headers: event.headers as string[], rows: event.rows as Record<string, string>[] } });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState({ status: "error", message: err instanceof Error ? err.message : "Network error. Please try again." });
    } finally {
      abortControllerRef.current = null;
    }
  }

  async function handleRefine(e: React.FormEvent) {
    e.preventDefault();
    const text = instruction.trim();
    if (!text) return;
    const data = currentData();
    if (!data) return;

    setState({ status: "refining", data });
    setInstruction("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/ai-format/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: data.csv,
          instructions: text,
          provider: provider.trim() || undefined,
          ...(employeeCount ? { employeeCount: Number(employeeCount) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
        signal: controller.signal,
      });
      const body: { error?: string; flags?: string[]; csv: string; headers: string[]; rows: Record<string, string>[] } = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { instruction: text, outcome: "error", detail: body.error ?? "Refinement failed." }]);
        setState({ status: "preview", data });
      } else {
        setFlags(body.flags ?? []);
        setMessages((m) => [...m, { instruction: text, outcome: "ok" }]);
        setState({ status: "preview", data: body });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages((m) => [...m, { instruction: text, outcome: "error", detail: "Network error." }]);
      setState({ status: "preview", data });
    } finally {
      abortControllerRef.current = null;
    }
  }

  function currentData(): PreviewData | null {
    if (state.status === "preview") return state.data;
    if (state.status === "refining") return state.data;
    if (state.status === "confirming") return state.data;
    if (state.status === "confirm_error") return state.data;
    return null;
  }

  function handleDownload() {
    const data = currentData();
    if (!data || !file) return;
    const blob = new Blob([data.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = formattedCsvFilename(file.name);
    a.click();
    URL.revokeObjectURL(url);
  }

  const busy = state.status === "formatting" || state.status === "confirming";
  const refining = state.status === "refining";
  const previewData = currentData();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col" showCloseButton={state.status !== "confirming"}>
        <DialogHeader>
          <DialogTitle>Format with AI</DialogTitle>
          <DialogDescription className="sr-only">
            AI-assisted payroll file formatter. Review the extracted data and refine as needed before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
          {state.status === "collecting_context" && (
            <form id="formatter-context-form" onSubmit={handleFormat} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">File</label>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="formatter-file"
                    className="inline-flex items-center cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    Choose file
                  </label>
                  <span className="text-sm text-muted-foreground truncate">
                    {file ? file.name : "No file chosen"}
                  </span>
                  <input
                    id="formatter-file"
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="formatter-provider" className="text-sm font-medium">Provider</label>
                <input
                  id="formatter-provider"
                  type="text"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder="e.g. ADP, Paychex, manual"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="formatter-employee-count" className="text-sm font-medium">
                  Employee count <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="formatter-employee-count"
                  type="number"
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  min={0}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="formatter-notes" className="text-sm font-medium">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="formatter-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Unusual layout, known quirks…"
                  rows={3}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </form>
          )}

          {state.status === "formatting" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Formatting file…
              </div>
              {thinkingText && (
                <div
                  ref={thinkingRef}
                  className="rounded-md border bg-muted/30 p-3 text-xs font-mono text-muted-foreground overflow-y-auto max-h-64 whitespace-pre-wrap"
                >
                  {thinkingText}
                </div>
              )}
            </div>
          )}

          {state.status === "needs_input" && (
            <form id="formatter-retry-form" onSubmit={handleRetry} className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Claude needs more information before it can format this file. Answer the questions below and resubmit — this is a one-time opportunity.
              </p>
              <ul className="flex flex-col gap-2">
                {state.questions.map((q, i) => (
                  <li key={i} className="text-sm font-medium">{q}</li>
                ))}
              </ul>
              <textarea
                aria-label="Your answers"
                value={answers}
                onChange={(e) => setAnswers(e.target.value)}
                placeholder="Type your answers here…"
                rows={4}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </form>
          )}

          {state.status === "error" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {state.message}
            </div>
          )}

          {previewData && (
            <>
              {flags.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-amber-800">Warnings — review before proceeding</p>
                  {flags.map((flag, i) => (
                    <p key={i} className="text-xs text-amber-700">{flag}</p>
                  ))}
                </div>
              )}

              <div className="shrink-0">
                <p className="text-xs text-muted-foreground mb-2 font-medium">
                  {previewData.headers.length} columns detected
                </p>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {previewData.headers.map((h, i) => (
                    <span
                      key={i}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground break-all"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      {previewData.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                        {previewData.headers.map((h, j) => (
                          <td key={j} className="px-3 py-2 whitespace-nowrap font-mono">
                            {row[h] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.rows.length > PREVIEW_ROWS && (
                  <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                    Showing {PREVIEW_ROWS} of {previewData.rows.length} rows
                  </p>
                )}
              </div>

              {state.status === "confirm_error" && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {state.message}
                </div>
              )}

              {messages.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {messages.map((msg, i) => (
                    <div key={i} className="text-xs flex gap-2 items-start">
                      <span className={msg.outcome === "ok" ? "text-green-600" : "text-destructive"}>
                        {msg.outcome === "ok" ? "✓" : "✗"}
                      </span>
                      <span className="text-muted-foreground flex-1">
                        {msg.instruction}
                        {msg.detail && <span className="text-destructive"> — {msg.detail}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleRefine} className="flex gap-2">
                <input
                  type="text"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  disabled={refining || busy}
                  placeholder="Give an instruction to adjust the data…"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <Button type="submit" size="sm" disabled={refining || busy || !instruction.trim()}>
                  {refining && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {refining ? "Refining…" : "Refine"}
                </Button>
              </form>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={state.status === "confirming"}>
            Cancel
          </Button>
          {state.status === "collecting_context" && (
            <Button
              form="formatter-context-form"
              type="submit"
              disabled={!file || !provider.trim()}
            >
              Format
            </Button>
          )}
          {state.status === "needs_input" && (
            <Button
              form="formatter-retry-form"
              type="submit"
              disabled={!answers.trim()}
            >
              Submit answers
            </Button>
          )}
          {previewData && (
            <Button variant="outline" onClick={handleDownload} disabled={busy}>
              Download CSV
            </Button>
          )}
          {previewData && (
            <Button onClick={handleConfirm} disabled={busy || refining}>
              {state.status === "confirming" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {state.status === "confirming" ? "Saving…" : "Use this data"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
