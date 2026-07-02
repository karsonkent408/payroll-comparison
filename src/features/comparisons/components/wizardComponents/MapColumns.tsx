import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ComparisonMutations } from "@/features/comparisons/mutations";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelect } from "@/components/ui/multi-select";
import { listUnmappedColumns } from "@/lib/unmappedColumns";
import { applyColumnSuggestion } from "@/lib/applyColumnSuggestion";
import { buildAutoEntries } from "../../newAutoMap";
import { UnmappedColumnDialog } from "@/features/comparisons/components/wizardComponents/UnmappedColumnDialog";
import type { ColumnSuggestion } from "@/server/api/services/aiMapper";
import { ComparisonQueries } from "@/features/comparisons/query";

const COMPARISON_CATEGORIES = [
  "Hours",
  "Earnings",
  "Non-Taxed Earnings",
  "FICA",
  "Benefits",
  "Deductions",
  "Taxes",
  "Fringes",
  "Net",
] as const;

type ComparisonCategory = (typeof COMPARISON_CATEGORIES)[number];

type EntryDraft = {
  id: string;
  legacy_columns: string[];
  new_columns: string[];
  category: ComparisonCategory;
  tolerance: string;
  label: string;
  labelEdited: boolean;
};

function makeEntry(category: ComparisonCategory): EntryDraft {
  return {
    id: crypto.randomUUID(),
    legacy_columns: [],
    new_columns: [],
    category,
    tolerance: "0.01",
    label: "",
    labelEdited: false,
  };
}

export interface MappingSummary {
  activeCount: number;
  unmappedLegacy: number;
  unmappedNew: number;
  warnings: string[];
}

interface MapColumnsProps {
  comparisonId: string;
  nextStep: () => void;
  onBack?: () => void;
}

export function AbsentColumnWarning({
  missingLegacy,
  missingNew,
}: {
  missingLegacy: string[];
  missingNew: string[];
}) {
  if (missingLegacy.length === 0 && missingNew.length === 0) return null;
  return (
    <div className="col-span-6 text-xs text-amber-700 mt-0.5 px-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {missingLegacy.map((col) => (
        <span key={`leg-${col}`}>Legacy: <span className="font-mono">{col}</span> not in source</span>
      ))}
      {missingNew.map((col) => (
        <span key={`mit-${col}`}>New: <span className="font-mono">{col}</span> not in source</span>
      ))}
    </div>
  );
}

interface SortableEntryRowProps {
  entry: EntryDraft;
  availableLegacyOptions: string[];
  availableNewOptions: string[];
  legacyHeaders: string[];
  newHeaders: string[];
  onLabelChange: (id: string, value: string) => void;
  onUpdate: (id: string, patch: Partial<EntryDraft>) => void;
  onRemove: (id: string) => void;
}

function SortableEntryRow({
  entry,
  availableLegacyOptions,
  availableNewOptions,
  legacyHeaders,
  newHeaders,
  onLabelChange,
  onUpdate,
  onRemove,
}: SortableEntryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const missingLegacy = entry.legacy_columns.filter((c) => !legacyHeaders.includes(c));
  const missingNew = entry.new_columns.filter((c) => !newHeaders.includes(c));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[20px_1fr_1fr_1fr_80px_32px] gap-2 items-start"
    >
      <button
        type="button"
        className="flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing mt-2"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        value={entry.label}
        onChange={(e) => onLabelChange(entry.id, e.target.value)}
        placeholder="Label…"
        className="h-9 text-sm"
      />
      <MultiSelect
        options={availableLegacyOptions}
        value={entry.legacy_columns}
        onChange={(v) => onUpdate(entry.id, { legacy_columns: v })}
        placeholder="Legacy cols…"
      />
      <MultiSelect
        options={availableNewOptions}
        value={entry.new_columns}
        onChange={(v) => onUpdate(entry.id, { new_columns: v })}
        placeholder="New cols…"
      />
      <Input
        type="number"
        step="0.01"
        min="0"
        value={entry.tolerance}
        onChange={(e) => onUpdate(entry.id, { tolerance: e.target.value })}
      />
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        className="flex items-center justify-center rounded text-muted-foreground hover:text-destructive mt-2"
        aria-label="Remove row"
      >
        ×
      </button>
      <AbsentColumnWarning missingLegacy={missingLegacy} missingNew={missingNew} />
    </div>
  );
}

export function MapColumns({
  comparisonId,
  nextStep,
  onBack,
}: MapColumnsProps) {
  const { isPending: empMappingIsPending, data: empMapping } = ComparisonQueries.useComparisonEmployeeMapping(comparisonId);
  const { isPending: entriesIsPending, data: initialEntries } = ComparisonQueries.useComparisonColumnMapping(comparisonId);
  const { isPending: sourcesIsPending, data: sources } = ComparisonQueries.useComparisonSources(comparisonId);

  const upsertColumnMapping = useMutation(ComparisonMutations.upsertColumnMapping);

  const [entries, setEntries] = useState<EntryDraft[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [autoMapping, setAutoMapping] = useState(false);
  const [autoMapError, setAutoMapError] = useState<string | null>(null);
  const autoMapAbortRef = useRef<AbortController | null>(null);
  const [unmatchedLegacy, setUnmatchedLegacy] = useState<string[]>([]);
  const [pendingDialog, setPendingDialog] = useState<{
    summary: MappingSummary;
    unmappedLegacy: string[];
    unmappedNew: string[];
  } | null>(null);
  const initializedForRef = useRef<string | null>(null);

  const isLoading = empMappingIsPending || entriesIsPending || sourcesIsPending;

  const legacyHeaders = sources?.legacy?.headers ?? [];
  const newHeaders = sources?.new?.headers ?? [];
  const legacyKey = empMapping?.legacy_employee_key ?? [];
  const newKey = empMapping?.new_employee_key ?? [];
  const newFirstNameColumn = empMapping?.new_first_name_column ?? null;
  const newLastNameColumn = empMapping?.new_last_name_column ?? null;

  useEffect(() => {
    if (isLoading || initializedForRef.current === comparisonId) return;
    initializedForRef.current = comparisonId;

    const saved = initialEntries?.entries;
    const source = saved != null
      ? saved
      : buildAutoEntries(newHeaders, sources?.new?.columnSections ?? {});

    setEntries(
      source.map((e) => ({
        id: crypto.randomUUID(),
        legacy_columns: e.legacy_columns,
        new_columns: e.new_columns,
        category: e.category,
        tolerance: String(e.tolerance ?? 0.01),
        label: e.label ?? "",
        labelEdited: (e.label ?? "") !== "",
      }))
    );
  }, [isLoading, comparisonId, initialEntries]);

  const sensors = useSensors(useSensor(PointerSensor));

  function updateEntry(id: string, patch: Partial<EntryDraft>) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e, ...patch };
        if ("new_columns" in patch && !next.labelEdited) {
          next.label = next.new_columns.join(" + ");
        }
        return next;
      })
    );
  }

  function setLabel(id: string, value: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, label: value, labelEdited: true } : e
      )
    );
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function addEntry(category: ComparisonCategory) {
    setEntries((prev) => [...prev, makeEntry(category)]);
  }

  function handleDragEnd(event: DragEndEvent, category: ComparisonCategory) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setEntries((prev) => {
      const categoryIds = prev
        .filter((e) => e.category === category)
        .map((e) => e.id);
      const oldIndex = categoryIds.indexOf(active.id as string);
      const newIndex = categoryIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reorderedIds = arrayMove(categoryIds, oldIndex, newIndex);

      const result: EntryDraft[] = [];
      let categoryPointer = 0;
      for (const e of prev) {
        if (e.category !== category) {
          result.push(e);
        } else {
          result.push(prev.find((x) => x.id === reorderedIds[categoryPointer])!);
          categoryPointer++;
        }
      }
      return result;
    });
  }

  function handleClearMapping() {
    if (!window.confirm("Clear all mapping entries? This cannot be undone.")) return;
    setEntries([]);
    setUnmatchedLegacy([]);
  }

  async function handleAutoMap() {
    const controller = new AbortController();
    autoMapAbortRef.current = controller;
    setAutoMapping(true);
    setAutoMapError(null);
    try {
      const res = await fetch(`/api/comparisons/${comparisonId}/ai-map`, { method: "POST", signal: controller.signal });
      const data: ColumnSuggestion & { error?: string } = await res.json();
      if (!res.ok) {
        setAutoMapError(data.error ?? "Auto-map failed.");
        return;
      }
      const { entries: updated } = applyColumnSuggestion(entries, data, legacyHeaders, newHeaders);
      setEntries(updated);
      setUnmatchedLegacy(data.unmatched_legacy);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setAutoMapError("Auto-map request failed. Please try again.");
    } finally {
      autoMapAbortRef.current = null;
      setAutoMapping(false);
    }
  }

  function handleCancelAutoMap() {
    autoMapAbortRef.current?.abort();
  }

  async function handleSave() {
    setErrors([]);
    const newSeen = new Map<string, number>();
    const legacySeen = new Map<string, number>();
    for (let i = 0; i < entries.length; i++) {
      for (const col of entries[i].new_columns) {
        if (newSeen.has(col)) {
          setErrors([`Duplicate New column "${col}" appears in entries ${newSeen.get(col)! + 1} and ${i + 1}`]);
          return;
        }
        newSeen.set(col, i);
      }
      for (const col of entries[i].legacy_columns) {
        if (legacySeen.has(col)) {
          setErrors([`Duplicate Legacy column "${col}" appears in entries ${legacySeen.get(col)! + 1} and ${i + 1}`]);
          return;
        }
        legacySeen.set(col, i);
      }
    }
    try {
      await upsertColumnMapping.mutateAsync({
        id: comparisonId,
        entries: entries.map((e, i) => ({
          legacy_columns: e.legacy_columns,
          new_columns: e.new_columns,
          category: e.category,
          tolerance: parseFloat(e.tolerance) || 0.01,
          label: e.label,
          display_order: i,
        })),
      });
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Save failed."]);
      return;
    }
    const { unmappedLegacy: uLegacy, unmappedNew: uNew } = listUnmappedColumns(
      legacyHeaders,
      newHeaders,
      entries,
      legacyKey,
      newKey,
      newFirstNameColumn,
      newLastNameColumn,
    );
    const summary: MappingSummary = {
      activeCount: entries.length,
      unmappedLegacy: uLegacy.length,
      unmappedNew: uNew.length,
      warnings: [],
    };
    if (uLegacy.length > 0 || uNew.length > 0) {
      setPendingDialog({ summary, unmappedLegacy: uLegacy, unmappedNew: uNew });
    } else {
      nextStep();
    }
  }

  if (isLoading) {
    return <MapColumnsSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Auto-map toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={autoMapping ? handleCancelAutoMap : handleAutoMap}
            disabled={upsertColumnMapping.isPending}
          >
            {autoMapping && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {autoMapping ? "Cancel" : "Auto-map with AI"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearMapping}
            disabled={autoMapping || upsertColumnMapping.isPending}
            className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive"
          >
            Clear mapping
          </Button>
          {autoMapError && (
            <span className="text-sm text-destructive">{autoMapError}</span>
          )}
        </div>
        {unmatchedLegacy.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span className="flex-1">
              <span className="font-medium">Couldn't auto-map:</span>{" "}
              {unmatchedLegacy.join(", ")}
            </span>
            <button
              type="button"
              onClick={() => setUnmatchedLegacy([])}
              className="text-amber-600 hover:text-amber-900 leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Category sections */}
      <div className="flex flex-col gap-4">
        {COMPARISON_CATEGORIES.map((category) => {
          const categoryEntries = entries.filter((e) => e.category === category);
          return (
            <div key={category} className="rounded-md border">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                <span className="text-sm font-semibold">{category}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {categoryEntries.length} {categoryEntries.length === 1 ? "entry" : "entries"}
                </span>
              </div>

              {categoryEntries.length > 0 && (
                <div className="px-4 py-2 flex flex-col gap-2">
                  <div className="grid grid-cols-[20px_1fr_1fr_1fr_80px_32px] gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                    <span />
                    <span>Label</span>
                    <span>Legacy Columns</span>
                    <span>New Columns</span>
                    <span>Tolerance</span>
                    <span />
                  </div>
                  <DndContext
                    sensors={sensors}
                    onDragEnd={(e) => handleDragEnd(e, category)}
                  >
                    <SortableContext
                      items={categoryEntries.map((e) => e.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {categoryEntries.map((entry) => {
                        const usedLegacyByOthers = new Set([
                          ...legacyKey,
                          ...entries.filter((e) => e.id !== entry.id).flatMap((e) => e.legacy_columns),
                        ]);
                        const usedNewByOthers = new Set([
                          ...newKey,
                          ...(newFirstNameColumn ? [newFirstNameColumn] : []),
                          ...(newLastNameColumn ? [newLastNameColumn] : []),
                          ...entries.filter((e) => e.id !== entry.id).flatMap((e) => e.new_columns),
                        ]);
                        const availableLegacyOptions = legacyHeaders.filter(
                          (h) => !usedLegacyByOthers.has(h) || entry.legacy_columns.includes(h)
                        );
                        const availableNewOptions = newHeaders.filter(
                          (h) => !usedNewByOthers.has(h) || entry.new_columns.includes(h)
                        );
                        return (
                          <SortableEntryRow
                            key={entry.id}
                            entry={entry}
                            availableLegacyOptions={availableLegacyOptions}
                            availableNewOptions={availableNewOptions}
                            legacyHeaders={legacyHeaders}
                            newHeaders={newHeaders}
                            onLabelChange={setLabel}
                            onUpdate={(id, patch) => {
                              const safe: typeof patch = { ...patch };
                              if ("new_columns" in safe) {
                                safe.new_columns = (safe.new_columns ?? []).filter(
                                  (c) => !usedNewByOthers.has(c)
                                );
                              }
                              if ("legacy_columns" in safe) {
                                safe.legacy_columns = (safe.legacy_columns ?? []).filter(
                                  (c) => !usedLegacyByOthers.has(c)
                                );
                              }
                              updateEntry(id, safe);
                            }}
                            onRemove={removeEntry}
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              )}

              <div className="px-4 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-7 text-xs"
                  onClick={() => addEntry(category)}
                >
                  + Add row
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <ul className="flex flex-col gap-1">
          {errors.map((e, i) => (
            <li key={i} className="text-sm text-destructive">{e}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-between">
        {onBack ? (
          <Button variant="outline" onClick={onBack} disabled={upsertColumnMapping.isPending}>Back</Button>
        ) : <span />}
        <Button onClick={handleSave} disabled={upsertColumnMapping.isPending}>
          {upsertColumnMapping.isPending ? "Saving…" : "Save & Next"}
        </Button>
      </div>

      {pendingDialog && (
        <UnmappedColumnDialog
          unmappedLegacy={pendingDialog.unmappedLegacy}
          unmappedNew={pendingDialog.unmappedNew}
          onConfirm={() => {
            const s = pendingDialog.summary;
            setPendingDialog(null);
            nextStep();
          }}
          onCancel={() => setPendingDialog(null)}
        />
      )}
    </div>
  );
}

function MapColumnsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-md border">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="px-4 py-3">
              <Skeleton className="h-7 w-16" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
