import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { CellEditPopover } from "@/features/comparisons/components/CellEditPopover";
import { ColumnBreakdownHoverCard } from "@/features/comparisons/components/ColumnBreakdownHoverCard";
import { ComparisonMutations } from "@/features/comparisons/mutations";
import { useMutation } from "@tanstack/react-query";
import { useDebouncer } from "@tanstack/react-pacer";
import type { DiscrepancyEntry } from "@/features/comparisons/types";
import type { RoomMessage } from "@/shared/lib/types";

type PresenceUser = { userId: string; userName: string; color: `#${string}`; userImage: string | null };

function effectiveStatus(d: Pick<DiscrepancyEntry, "manual_override" | "auto_status">) {
  return d.manual_override ?? d.auto_status;
}

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatValue(value: number, category: string): string {
  return category === "Hours" ? value.toFixed(2) : usdFormatter.format(value);
}

export function DiscrepancyRow({
  comparisonId,
  category,
  entry,
  noteDraft,
  onNoteChange,
  onPatch,
  firstColumn = "employee",
  comparisonStatus,
  readOnly = false,
  editingUser = null,
  noteEditingUser = null,
  presence = [],
  send,
  userId,
}: {
  comparisonId: string;
  category: string;
  entry: DiscrepancyEntry;
  noteDraft: string;
  onNoteChange: (val: string) => void;
  onPatch: (updated: DiscrepancyEntry) => void;
  firstColumn?: "employee" | "label";
  comparisonStatus?: string;
  readOnly?: boolean;
  editingUser?: { userId: string; color: string } | null;
  noteEditingUser?: { userId: string; color: string } | null;
  presence?: PresenceUser[];
  send?: (message: RoomMessage) => void;
  userId?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const resolved = effectiveStatus(entry) === "resolved";
  const canEdit = comparisonStatus !== "setup" && !readOnly;
  const patchMappingEntry = useMutation(ComparisonMutations.patchMappingEntry);

  async function patch(body: object) {
    setSaving(true);
    try {
      const updated = await patchMappingEntry.mutateAsync({ id: comparisonId, mappingEntryId: String(entry.id), ...body });
      onPatch({ ...entry, ...updated });
    } finally {
      setSaving(false);
    }
  }

  const debouncedSave = useDebouncer(
    (note: string) => patch({ note }),
    { wait: 400 }
  );

  return (
    <div className={`grid grid-cols-[1fr_90px_90px_90px_1fr_96px] gap-3 items-center px-4 py-2.5 text-sm border-b last:border-b-0 ${resolved ? "opacity-50" : ""}`}>
      <span className="font-mono text-xs truncate flex items-center gap-1.5">
        {resolved && <Check className="h-3 w-3 text-green-600 shrink-0" />}
        {firstColumn === "label"
          ? entry.label
          : entry.employee_name
            ? <>{entry.employee_name} <span className="text-muted-foreground">({entry.employee_key})</span></>
            : entry.employee_key}
      </span>
      <span className="tabular-nums text-right flex items-center justify-end gap-1 group/legacy relative">
        {editingUser && (() => {
          const editorName = presence.find((p) => p.userId === editingUser.userId)?.userName;
          return (
            <span
              data-editing-ring
              title={editorName ? `${editorName} is editing` : "Someone is editing"}
              style={{ borderColor: editingUser.color }}
              className="absolute inset-0 rounded border-2 pointer-events-none"
            />
          );
        })()}
        {formatValue(entry.legacy_value, category)}
        <ColumnBreakdownHoverCard breakdown={entry.legacy_breakdown ?? null} side="Legacy" />
        {canEdit && (
          <CellEditPopover
            open={editOpen}
            onOpenChange={setEditOpen}
            comparisonId={comparisonId}
            employeeKey={entry.employee_key}
            legacyColumns={entry.legacy_columns}
            discrepancyId={entry.id}
            send={send}
            userId={userId}
            entryId={entry.id}
            onSaved={(results) => {
              const match = results.find((r) => r.column_entry_id === entry.column_entry_id) ?? results[0];
              if (match) {
                onPatch({
                  ...entry,
                  legacy_value: match.legacy_value,
                  new_value: match.new_value,
                  difference: match.difference,
                  auto_status: match.auto_status as "resolved" | "unresolved",
                });
              }
            }}
          >
            <button
              className="opacity-0 group-hover/legacy:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
              onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
              aria-label="Edit Legacy value"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          </CellEditPopover>
        )}
      </span>
      <span className="tabular-nums text-right flex items-center justify-end gap-1">
        {formatValue(entry.new_value, category)}
        <ColumnBreakdownHoverCard breakdown={entry.new_breakdown ?? null} side="New" />
      </span>
      <span className={`tabular-nums text-right font-medium ${entry.auto_status === "unresolved" ? "text-destructive" : ""}`}>
        {formatValue(entry.difference, category)}
      </span>
      <span className="relative">
        {noteEditingUser && (() => {
          const editorName = presence.find((p) => p.userId === noteEditingUser.userId)?.userName;
          return (
            <span
              title={editorName ? `${editorName} is editing` : "Someone is editing"}
              style={{ borderColor: noteEditingUser.color }}
              className="absolute inset-0 rounded border-2 pointer-events-none z-10"
            />
          );
        })()}
        <Input
          value={noteDraft}
          onChange={(e) => {
            onNoteChange(e.target.value);
            debouncedSave.maybeExecute(e.target.value);
          }}
          onFocus={() => userId && send?.({ type: "note_focus", entryId: entry.id, userId })}
          onBlur={() => userId && send?.({ type: "note_blur", entryId: entry.id, userId })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if ((e.metaKey || e.ctrlKey) && e.key === "a") {
              e.preventDefault();
              e.currentTarget.select();
            }
          }}
          placeholder="Note…"
          className="h-7 text-xs"
        />
      </span>
      {resolved ? (
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => patch({ manual_override: null, note: noteDraft })}
          className="h-7 text-xs"
        >
          Unresolve
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={saving}
          onClick={() => patch({ manual_override: "resolved", note: noteDraft })}
          className="h-7 text-xs"
        >
          Resolve
        </Button>
      )}
    </div>
  );
}
