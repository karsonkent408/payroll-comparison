import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronRight, Download, Settings } from "lucide-react";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { StatusBadge, type ComparisonStatus } from "@/features/comparisons/components/StatusBadge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { summarizeResults } from "@/shared/lib/summarizeResults";
import { ExportModal } from "@/features/comparisons/components/ExportModal";
import { DiscrepancyRow } from "@/features/comparisons/components/DiscrepancyRow";
import { useComparisonRoom } from "@/features/comparisons/hooks";
import { useEditingState } from "@/features/comparisons/useEditingState";
import { authClient } from "@/shared/lib/auth-client";
import { ComparisonQueries } from "@/features/comparisons/query";
import { useQueryClient } from "@tanstack/react-query";
import type { StoredResults, StoredMatchedRow, StoredEntryResult, StoredUnmatchedEmployee, DiscrepancyEntry } from "@/features/comparisons/types";
import { sortMatchedRows, coerceSortPreference } from "@/features/comparisons/sortMatchedRows";
import { Avatar, AvatarImage, AvatarFallback } from "@/shared/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
// --- Constants ---

const CATEGORY_ORDER = [
  "Hours",
  "Earnings",
  "Non-Taxed Earnings",
  "FICA",
  "Benefits",
  "Deductions",
  "Taxes",
  "Fringes",
  "Net",
];

// --- Types ---

type CategoryStats = { total: number; resolved: number };

type ComparisonData = {
  id: number;
  label: string;
  pay_period_start: string;
  pay_period_end: string;
  owner: { id: string; name: string } | null;
  status: ComparisonStatus;
  summary: {
    byCategory: Record<string, CategoryStats>;
    unmatched: { total: number; resolved: number };
  };
};

// DiscrepancyEntry is StoredEntryResult with employee fields merged in by buildByCategory
type UnmatchedEmployee = StoredUnmatchedEmployee;

type MappingEntryGroup = {
  column_entry_id: string;
  label: string;
  display_order: number;
  entries: DiscrepancyEntry[];
};

// --- Helpers ---

function effectiveStatus(d: Pick<StoredEntryResult, 'manual_override' | 'auto_status'>) {
  return d.manual_override ?? d.auto_status;
}

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });


function buildByCategory(matched: StoredMatchedRow[]): Map<string, MappingEntryGroup[]> {
  const map = new Map<string, Map<string, MappingEntryGroup>>();
  for (const row of matched) {
    for (const result of row.results) {
      let catMap = map.get(result.category);
      if (!catMap) { catMap = new Map(); map.set(result.category, catMap); }
      let group = catMap.get(result.column_entry_id);
      if (!group) {
        group = { column_entry_id: result.column_entry_id, label: result.label, display_order: result.display_order, entries: [] };
        catMap.set(result.column_entry_id, group);
      }
      group.entries.push({ ...result, employee_key: row.employee_key, employee_name: row.employee_name });
    }
  }
  // Convert inner maps to arrays sorted by display_order
  const result = new Map<string, MappingEntryGroup[]>();
  for (const [category, groups] of map) {
    result.set(category, Array.from(groups.values()).sort((a, b) => a.display_order - b.display_order));
  }
  return result;
}

function resolutionPct(byCategory: Record<string, CategoryStats>): number {
  let total = 0;
  let resolved = 0;
  for (const s of Object.values(byCategory)) {
    total += s.total;
    resolved += s.resolved;
  }
  if (total === 0) return 100;
  return Math.round((resolved / total) * 100);
}


// // --- Unmatched employee row ---

// function UnmatchedRow({
//   comparisonId,
//   employee,
//   noteDraft,
//   onNoteChange,
//   onPatch,
// }: {
//   comparisonId: string;
//   employee: UnmatchedEmployee;
//   noteDraft: string;
//   onNoteChange: (val: string) => void;
//   onPatch: (updated: UnmatchedEmployee) => void;
// }) {
//   const [saving, setSaving] = useState(false);

//   async function patch(body: object) {
//     setSaving(true);
//     try {
//       const res = await fetch(`/api/comparisons/${comparisonId}/employeePair/${employee.id}`, {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(body),
//       });
//       if (res.ok) onPatch(await res.json());
//     } finally {
//       setSaving(false);
//     }
//   }

//   return (
//     <div className={`grid grid-cols-[1fr_80px_1fr_96px] gap-3 items-center px-4 py-2.5 text-sm border-b last:border-b-0 ${employee.resolved ? "opacity-50" : ""}`}>
//       <span className="font-mono text-xs truncate flex items-center gap-1.5">
//         {employee.resolved && <Check className="h-3 w-3 text-green-600 shrink-0" />}
//         {employee.employee_name
//           ? <>{employee.employee_name} <span className="text-muted-foreground">({employee.employee_key})</span></>
//           : employee.employee_key}
//       </span>
//       <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${employee.source_type === "legacy" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}`}>
//         {employee.source_type === "legacy" ? "Legacy" : "New"}
//       </span>
//       <Input
//         value={noteDraft}
//         onChange={(e) => onNoteChange(e.target.value)}
//         onBlur={() => { if (noteDraft !== (employee.note ?? "")) patch({ note: noteDraft }); }}
//         onKeyDown={(e) => {
//           e.stopPropagation();
//           if ((e.metaKey || e.ctrlKey) && e.key === "a") {
//             e.preventDefault();
//             e.currentTarget.select();
//           }
//         }}
//         placeholder="Note…"
//         className="h-7 text-xs"
//       />
//       {employee.resolved ? (
//         <Button size="sm" variant="outline" disabled={saving} onClick={() => patch({ resolved: false, note: noteDraft })} className="h-7 text-xs">
//           Unresolve
//         </Button>
//       ) : (
//         <Button size="sm" disabled={saving} onClick={() => patch({ resolved: true, note: noteDraft })} className="h-7 text-xs">
//           Resolve
//         </Button>
//       )}
//     </div>
//   );
// }

// --- Category row ---

function CategoryRow({
  category,
  stats,
  groups,
  expanded,
  onToggle,
  comparisonId,
  notes,
  onNoteChange,
  onPatch,
  comparisonStatus,
  readOnly = false,
  editingByEntry,
  noteEditingByEntry,
  presence,
  send,
  userId,
}: {
  category: string;
  stats: CategoryStats | undefined;
  groups: MappingEntryGroup[];
  expanded: boolean;
  onToggle: () => void;
  comparisonId: string;
  notes: Record<number, string>;
  onNoteChange: (id: number, val: string) => void;
  onPatch: (updated: DiscrepancyEntry) => void;
  comparisonStatus?: string;
  readOnly?: boolean;
  editingByEntry?: Map<number, string>;
  noteEditingByEntry?: Map<number, string>;
  presence?: { userId: string; userName: string; color: `#${string}`; userImage: string | null }[];
  send?: (message: import("@/shared/lib/types").RoomMessage) => void;
  userId?: string;
}) {
  const allEntries = groups.flatMap((g) => g.entries);
  const allResolved = allEntries.length > 0 && allEntries.every((e) => effectiveStatus(e) === "resolved");
  const resolvedCount = stats?.resolved ?? allEntries.filter((e) => effectiveStatus(e) === "resolved").length;
  const total = stats?.total ?? allEntries.length;

  return (
    <div className="rounded-md border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium">{category}</span>
        </div>
        {allResolved ? (
          <span className="flex items-center gap-1 text-green-700 text-xs font-medium">
            <Check className="h-3.5 w-3.5" /> All resolved
          </span>
        ) : (
          <span className="text-xs text-muted-foreground tabular-nums">
            {resolvedCount} / {total} resolved
          </span>
        )}
      </button>

      {expanded && allEntries.length > 0 && (
        <div className="border-t bg-muted/20">
          {groups.map((group) => (
            <div key={group.column_entry_id}>
              {/* Sub-group header */}
              <div className="px-4 py-1.5 bg-muted/40 border-b">
                <span className="text-xs font-semibold text-foreground/70">
                  {group.label || "Unlabeled"}
                </span>
              </div>
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_90px_90px_90px_1fr_96px] gap-3 px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                <span>Employee</span>
                <span className="text-right">Legacy</span>
                <span className="text-right">New</span>
                <span className="text-right">Diff</span>
                <span>Note</span>
                <span />
              </div>
              {group.entries.map((entry) => {
                const editorUserId = editingByEntry?.get(entry.id);
                const editorPresence = editorUserId ? presence?.find((p) => p.userId === editorUserId) : undefined;
                const editingUser = editorUserId && editorPresence
                  ? { userId: editorUserId, color: editorPresence.color }
                  : null;
                const noteEditorUserId = noteEditingByEntry?.get(entry.id);
                const noteEditorPresence = noteEditorUserId ? presence?.find((p) => p.userId === noteEditorUserId) : undefined;
                const noteEditingUser = noteEditorUserId && noteEditorPresence
                  ? { userId: noteEditorUserId, color: noteEditorPresence.color }
                  : null;
                return (
                  <DiscrepancyRow
                    key={entry.id}
                    comparisonId={comparisonId}
                    category={category}
                    entry={entry}
                    noteDraft={notes[entry.id] ?? ""}
                    onNoteChange={(val) => onNoteChange(entry.id, val)}
                    onPatch={onPatch}
                    comparisonStatus={comparisonStatus}
                    readOnly={readOnly}
                    editingUser={editingUser}
                    noteEditingUser={noteEditingUser}
                    presence={presence}
                    send={send}
                    userId={userId}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}

      {expanded && allEntries.length === 0 && (
        <div className="border-t px-4 py-3 text-sm text-muted-foreground">
          No discrepancies in this category.
        </div>
      )}
    </div>
  );
}

// --- Page ---

export function ComparisonDetail() {
  const { id } = useParams({ from: "/comparisons/$id" });
  const navigate = useNavigate();
  const search = useSearch({ from: "/comparisons/$id" });
  const flashMessage = (search.message);
  const queryClient = useQueryClient();
  const { isPending: comparisonPending, isFetching: comparisonFetching, isError: comparisonError, data: comparison, refetch: refetchComparison } = ComparisonQueries.useComparison(id)
  const { data: results } = ComparisonQueries.useComparisonResults(id)
  // const hasSeededNotes = useRef(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [flashDismissed, setFlashDismissed] = useState(false);
  const { data: session } = authClient.useSession();
  const currentUser = session?.user;
  const userCanModify = comparison
    ? (currentUser?.role === "admin" || comparison.owner?.id === currentUser?.id)
    : false;


  const { editingByEntry, noteEditingByEntry, handleMessage: handleEditingMessage } = useEditingState({
    currentUserId: currentUser?.id ?? "",
  });

  const { presence, connected, send } = useComparisonRoom({
    comparisonId: currentUser ? String(id) : "__pending__",
    userId: currentUser?.id ?? "",
    userName: currentUser?.name ?? "",
    userImage: currentUser?.image ?? null,

    onMessage: (message) => {
      if (message.type === "reconfigure") {
        refetchComparison();
        queryClient.invalidateQueries({ queryKey: ['comparisons', id, 'results'] });
        if (message.updatedBy.id !== currentUser?.id) {
          toast(`Reconfigured by ${message.updatedBy.name}. Refreshing…`);
        }
      }
      if (message.type === "edit") {
        queryClient.setQueryData(['comparisons', id, 'results'], (prev: StoredResults | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            matched: prev.matched.map((row) => ({
              ...row,
              results: row.results.map((r) =>
                r.id === Number(message.entryId)
                  ? { ...r, [message.field]: message.value }
                  : r
              ),
            })),
          };
        });
        if (message.field === 'note') {
          setNotes((prev) => ({ ...prev, [Number(message.entryId)]: String(message.value ?? '') }));
        }
      }
      if (message.type === "entry_focus" || message.type === "entry_blur") {
        handleEditingMessage(message);
      }
    },
  });

  // useEffect(() => {
  //   if (!flashMessage) return;
  //   const t = setTimeout(() => setFlashDismissed(true), 4000);
  //   return () => clearTimeout(t);
  // }, [flashMessage]);

  // useEffect(() => {
  //   hasSeededNotes.current = false;
  // }, [id]);

  // useEffect(() => {
  //   if (!results || hasSeededNotes.current) return;
  //   hasSeededNotes.current = true;
  //   const initial: Record<number, string> = {};
  //   for (const row of results.matched ?? []) {
  //     for (const entry of row.results) {
  //       initial[entry.id] = entry.note ?? "";
  //     }
  //   }
  //   setNotes(initial);
  //   const unmatchedInitial: Record<number, string> = {};
  //   for (const u of results.unmatched ?? []) {
  //     unmatchedInitial[u.id] = u.note ?? "";
  //   }
  //   setUnmatchedNotes(unmatchedInitial);
  // }, [results]);


  const byCategory = useMemo<Map<string, MappingEntryGroup[]>>(() => {
    if (!results || !comparison) return new Map();
    const pref = coerceSortPreference(comparison.sort_preference);
    if (pref === "discrepancy_amount") {
      const map = buildByCategory(results.matched);
      for (const groups of map.values()) {
        for (const group of groups) {
          group.entries.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
        }
      }
      return map;
    }
    return buildByCategory(sortMatchedRows(results.matched, pref));
  }, [results, comparison]);

  const { byEmployee, majorIssues } = useMemo(
    () => (results ? summarizeResults(results) : { byEmployee: new Map(), majorIssues: [] }),
    [results]
  );

  const sortedEmployees = useMemo(
    () => (results && comparison ? sortMatchedRows(results.matched, coerceSortPreference(comparison.sort_preference)) : []),
    [results, comparison]
  );

  function toggleCategory(category: string) {
    setExpanded((prev) => {
      if (prev.has(category)) return new Set();
      return new Set([category]);
    });
  }

  // function handleUnmatchedPatch(updated: UnmatchedEmployee) {
  //   queryClient.setQueryData(['comparisons', id, 'results'], (prev: StoredResults | undefined) => {
  //     if (!prev) return prev;
  //     return {
  //       ...prev,
  //       unmatched: prev.unmatched.map((u) => (u.id === updated.id ? updated : u)),
  //     };
  //   });
  //   setUnmatchedNotes((prev) => ({ ...prev, [updated.id]: updated.note ?? "" }));
  //   refetchComparison();
  // }

  function handlePatch(updated: DiscrepancyEntry) {
    // Find old entry to compute status delta before updating state
    let category: string | undefined;
    let wasResolved = false;
    for (const row of results?.matched ?? []) {
      const old = row.results.find((r) => r.id === updated.id);
      if (old) { category = old.category; wasResolved = effectiveStatus(old) === "resolved"; break; }
    }
    const isResolved = effectiveStatus(updated) === "resolved";

    queryClient.setQueryData(['comparisons', id, 'results'], (prev: StoredResults | undefined) => {
      if (!prev) return prev;
      return {
        ...prev,
        matched: prev.matched.map((row) => ({
          ...row,
          results: row.results.map((r) => (r.id === updated.id ? { ...updated, category: r.category } : r)),
        })),
      };
    });

    if (category && wasResolved !== isResolved) {
      queryClient.setQueryData(['comparisons', id], (prev: ComparisonData | undefined) => {
        if (!prev) return prev;
        const stats = prev.summary.byCategory[category!];
        if (!stats) return prev;
        const updatedByCategory = {
          ...prev.summary.byCategory,
          [category!]: { ...stats, resolved: stats.resolved + (isResolved ? 1 : -1) },
        };
        const totalUnresolved = Object.values(updatedByCategory).reduce(
          (sum, s) => sum + (s.total - s.resolved), 0
        );
        const unmatchedUnresolved = prev.summary.unmatched.total - prev.summary.unmatched.resolved;
        const newStatus: ComparisonStatus =
          prev.status === "setup" ? "setup" :
          totalUnresolved > 0 || unmatchedUnresolved > 0 ? "fail" : "pass";
        return {
          ...prev,
          status: newStatus,
          summary: { ...prev.summary, byCategory: updatedByCategory },
        };
      });
    }

    setNotes((prev) => ({ ...prev, [updated.id]: updated.note ?? "" }));
  }

  if (comparisonError) {
    return (
      <div className="p-8 flex flex-col gap-4">
        <Link to="/" search={{ page: 1, filters: undefined }} className="text-sm text-muted-foreground hover:text-foreground">
          ← Comparisons
        </Link>
        <div className="rounded-lg border p-8 flex flex-col items-center gap-2 text-center">
          <p className="text-lg font-semibold">Comparison not found</p>
          <p className="text-sm text-muted-foreground">No comparison exists with ID {id}.</p>
        </div>
      </div>
    );
  }

  if (!comparison) {
    return <ComparisonDetailSkeleton />;
  }

  const pct = resolutionPct(comparison.summary.byCategory);
  const { unmatched } = comparison.summary;

  // Categories in canonical order, include ones with data even if not in CATEGORY_ORDER
  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => comparison.summary.byCategory[c] || byCategory.has(c)),
    ...Array.from(byCategory.keys()).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  return (
    <Card className="h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] flex flex-col p-8 gap-6 overflow-hidden m-8">
      {flashMessage && !flashDismissed && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center justify-between">
          {flashMessage}
          <button onClick={() => setFlashDismissed(true)} className="ml-4 text-green-600 hover:text-green-800 text-base leading-none">×</button>
        </div>
      )}
      {/* Header */}
      <div>
        <Link to="/" search={{ page: 1, filters: undefined }} className="text-sm text-muted-foreground hover:text-foreground">
          ← Comparisons
        </Link>
        <div className="flex items-start justify-between mt-3">
          <div>
            <h1 className="text-2xl font-bold">{comparison.label}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Pay period: {comparison.pay_period_start} – {comparison.pay_period_end}</p>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const others = presence.filter((u) => u.userId !== currentUser?.id);
              return others.length > 0 && (
                <div className="flex items-center -space-x-1">
                  {others.slice(0, 4).map((u) => (
                    <HoverCard key={u.userId}>
  <HoverCardTrigger>
                    <Avatar
                      title={u.userName}
                      className="h-6 w-6 border text-[10px]"
                      style={{ borderColor: u.color }}
                      >
                      <AvatarImage src={u.userImage ?? undefined} alt={u.userName} />
                      <AvatarFallback className="text-[10px]">{u.userName.split(" ").filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join("")}</AvatarFallback>
                    </Avatar>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-auto p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10" style={{ borderColor: u.color, borderWidth: 2, borderStyle: "solid" }}>
                            <AvatarImage src={u.userImage ?? undefined} alt={u.userName} />
                            <AvatarFallback className="text-xs">{u.userName.split(" ").filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join("")}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium leading-none">{u.userName}</span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                              Currently viewing
                            </span>
                          </div>
                        </div>
                      </HoverCardContent>
                      </HoverCard>
                  ))}
                  {others.length > 4 && (
                    <div className="h-6 w-6 rounded-full bg-muted border border-background flex items-center justify-center text-[10px] text-muted-foreground">
                      +{others.length - 4}
                    </div>
                  )}
                </div>
              );
            })()}
            {!connected && (
              <span className="text-xs text-muted-foreground">Reconnecting…</span>
            )}
            <StatusBadge status={comparison.status} />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Export"
              onClick={() => setExportModalOpen(true)}
            >
              <Download className="h-4 w-4" />
            </Button>
            <ExportModal
              open={exportModalOpen}
              onClose={() => setExportModalOpen(false)}
              comparisonId={Number(id)}
              comparisonLabel={comparison.label}
              payPeriodStart={comparison.pay_period_start}
              payPeriodEnd={comparison.pay_period_end}
            />
            <Link to="/comparisons/$id/options" params={{ id }}>
              <Button variant="ghost" size="icon" aria-label="Options">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Three-tab layout */}
      <Tabs defaultValue="summary" className="flex flex-col flex-1 min-h-0">
        <TabsList className='w-full'>
          <TabsTrigger className='flex grow' value="summary">Summary</TabsTrigger>
          <TabsTrigger className='flex grow' value="by-category">By Category</TabsTrigger>
          <TabsTrigger className='flex grow' value="by-employee">By Employee</TabsTrigger>
        </TabsList>

        {/* Summary tab */}
        <TabsContent value="summary" className="flex flex-col gap-4 mt-2 overflow-y-auto flex-1 min-h-0">
          {/* Overall resolution */}
          <div className="shrink-0 rounded-lg border p-4 flex items-center justify-between">
            <p className="text-sm font-medium">Overall resolution</p>
            <div className="flex items-center gap-3">
              <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-sm font-semibold tabular-nums">{pct}%</span>
            </div>
          </div>

          {/* By Category */}
          {orderedCategories.length > 0 && (
            <div className="shrink-0 rounded-lg border overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">By Category</p>
              </div>
              {orderedCategories.map((category) => {
                const stats = comparison.summary.byCategory[category];
                if (!stats) return null;
                const catPct = stats.total === 0 ? 100 : Math.round((stats.resolved / stats.total) * 100);
                return (
                  <div key={category} className="flex items-center justify-between px-4 py-2.5 text-sm border-b last:border-b-0">
                    <span className="font-medium">{category}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${catPct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground w-16 text-right">
                        {stats.resolved} / {stats.total}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}


          {/* Major Issues */}
          {/* {majorIssues.length > 0 && (
            <div className="flex-shrink-0 rounded-lg border overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Major Issues</p>
              </div>
              {majorIssues.map((issue) => (
                <div key={issue.id} className="flex items-start justify-between px-4 py-2.5 text-sm border-b last:border-b-0 gap-4">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-mono text-xs truncate">
                      {issue.employee_name
                        ? <>{issue.employee_name} <span className="text-muted-foreground">({issue.employee_key})</span></>
                        : issue.employee_key}
                    </span>
                    <span className="text-xs text-muted-foreground">{issue.label} · {issue.category}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-destructive shrink-0">
                    {issue.category === "Hours" ? issue.difference.toFixed(2) : usdFormatter.format(issue.difference)}
                  </span>
                </div>
              ))}
            </div>
          )} */}
        </TabsContent>

        {/* By Category tab */}
        <TabsContent value="by-category" className="flex flex-col gap-4 mt-2 overflow-y-auto flex-1 min-h-0">
          {/* Category accordion */}
          <div className="flex flex-col gap-2">
            {orderedCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">No discrepancies recorded yet.</p>
            ) : (
              orderedCategories.map((category) => (
                <CategoryRow
                  key={category}
                  category={category}
                  stats={comparison.summary.byCategory[category]}
                  groups={byCategory.get(category) ?? []}
                  expanded={expanded.has(category)}
                  onToggle={() => toggleCategory(category)}
                  comparisonId={id}
                  notes={notes}
                  onNoteChange={(entryId, val) => setNotes((prev) => ({ ...prev, [entryId]: val }))}
                  onPatch={handlePatch}
                  comparisonStatus={comparison.status}
                  readOnly={!userCanModify}
                  editingByEntry={editingByEntry}
                  noteEditingByEntry={noteEditingByEntry}
                  presence={presence}
                  send={send}
                  userId={currentUser?.id}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* By Employee tab */}
        <TabsContent value="by-employee" className="flex flex-col gap-2 mt-2 overflow-y-auto flex-1 min-h-0">
          {sortedEmployees.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">No matched employees.</p>
          ) : sortedEmployees.map((row) => {
            const empStats = byEmployee.get(row.employee_key);
            const empPct = empStats && empStats.total > 0
              ? Math.round((empStats.resolved / empStats.total) * 100)
              : 100;
            const isExpanded = expandedEmployees.has(row.employee_key);

            // Group results by category in canonical order
            const byCat = new Map<string, (DiscrepancyEntry & { category: string })[]>();
            for (const r of row.results) {
              if (!byCat.has(r.category)) byCat.set(r.category, []);
              byCat.get(r.category)!.push({ ...r, employee_key: row.employee_key, employee_name: row.employee_name });
            }
            const empCategories = [
              ...CATEGORY_ORDER.filter((c) => byCat.has(c)),
              ...Array.from(byCat.keys()).filter((c) => !CATEGORY_ORDER.includes(c)),
            ];

            return (
              <div key={row.employee_key} className="shrink-0 rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedEmployees((prev) => {
                    const next = new Set(prev);
                    if (next.has(row.employee_key)) next.delete(row.employee_key);
                    else next.add(row.employee_key);
                    return next;
                  })}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-mono text-xs">
                      {row.employee_name
                        ? <>{row.employee_name} <span className="text-muted-foreground">({row.employee_key})</span></>
                        : row.employee_key}
                    </span>
                  </div>
                  {empPct === 100 ? (
                    <span className="flex items-center gap-1 text-green-700 text-xs font-medium">
                      <Check className="h-3.5 w-3.5" /> All resolved
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {empStats?.resolved ?? 0} / {empStats?.total ?? 0} resolved
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t bg-muted/20">
                    {empCategories.map((category) => (
                      <div key={category}>
                        <div className="px-4 py-1.5 bg-muted/40 border-b">
                          <span className="text-xs font-semibold text-foreground/70">{category}</span>
                        </div>
                        <div className="grid grid-cols-[1fr_90px_90px_90px_1fr_96px] gap-3 px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                          <span>Label</span>
                          <span className="text-right">Legacy</span>
                          <span className="text-right">New</span>
                          <span className="text-right">Diff</span>
                          <span>Note</span>
                          <span />
                        </div>
                        {(byCat.get(category) ?? []).map((entry) => {
                          const editorUserId = editingByEntry.get(entry.id);
                          const editorPresence = editorUserId ? presence.find((p) => p.userId === editorUserId) : undefined;
                          const editingUser = editorUserId && editorPresence
                            ? { userId: editorUserId, color: editorPresence.color }
                            : null;
                          const noteEditorUserId = noteEditingByEntry.get(entry.id);
                          const noteEditorPresence = noteEditorUserId ? presence.find((p) => p.userId === noteEditorUserId) : undefined;
                          const noteEditingUser = noteEditorUserId && noteEditorPresence
                            ? { userId: noteEditorUserId, color: noteEditorPresence.color }
                            : null;
                          return (
                            <DiscrepancyRow
                              key={entry.id}
                              comparisonId={id}
                              category={category}
                              entry={entry}
                              firstColumn="label"
                              noteDraft={notes[entry.id] ?? ""}
                              onNoteChange={(val) => setNotes((prev) => ({ ...prev, [entry.id]: val }))}
                              onPatch={handlePatch}
                              comparisonStatus={comparison.status}
                              readOnly={!userCanModify}
                              editingUser={editingUser}
                              noteEditingUser={noteEditingUser}
                              presence={presence}
                              send={send}
                              userId={currentUser?.id}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function ComparisonDetailSkeleton() {
  return (
    <div className="p-8 flex flex-col gap-6">
      <Skeleton className="h-4 w-28" />
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>
      <div className="flex gap-1">
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="h-9 flex-1 rounded-md" />
      </div>
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
      <div className="rounded-lg border overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30">
          <Skeleton className="h-3 w-24" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b last:border-b-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
