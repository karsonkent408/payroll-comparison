import { useState } from "react";
import { Bug } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type State =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "done"; url: string }
  | { phase: "error"; message: string };

export function DevIssueReporter() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [label, setLabel] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function reset() {
    setTitle("");
    setDescription("");
    setLabel("");
    setState({ phase: "idle" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setState({ phase: "submitting" });
    try {
      const res = await fetch("/api/dev/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, label: label || undefined }),
      });
      const data: { error?: string; url?: string } = await res.json();
      if (!res.ok) {
        setState({ phase: "error", message: data.error ?? "Failed to create issue." });
      } else {
        setState({ phase: "done", url: data.url ?? "" });
      }
    } catch {
      setState({ phase: "error", message: "Network error." });
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Report an issue"
        className="fixed bottom-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-md hover:bg-muted/80 hover:text-foreground transition-colors"
      >
        <Bug className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report an issue</DialogTitle>
          </DialogHeader>

          {state.phase === "done" ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">Issue created successfully.</p>
              <a
                href={state.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium underline underline-offset-4 break-all"
              >
                {state.url}
              </a>
              <DialogFooter>
                <Button onClick={() => handleOpenChange(false)}>Close</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-title">Title</Label>
                <Input
                  id="issue-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short description of the issue"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-body">
                  Description{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="issue-body"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Steps to reproduce, expected behavior…"
                  rows={4}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-label">
                  Label{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <select
                  id="issue-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">No label</option>
                  <option value="triage">triage</option>
                  <option value="ready-for-agent">ready-for-agent</option>
                  <option value="bug">bug</option>
                </select>
              </div>

              {state.phase === "error" && (
                <p className="text-sm text-destructive">{state.message}</p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!title.trim() || state.phase === "submitting"}
                >
                  {state.phase === "submitting" ? "Creating…" : "Create issue"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
