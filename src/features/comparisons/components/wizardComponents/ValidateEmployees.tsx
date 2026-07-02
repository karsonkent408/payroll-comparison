import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { tokenOverlap, computeFuzzyCandidatesFromKeys } from "@/lib/fuzzyMatch";
import { normalizeEmployeeKey } from "@/lib/normalizeEmployeeKey";
import type { FuzzyMatchCandidate } from "@/lib/types";
import { ComparisonQueries } from "@/features/comparisons/query";

type ActionRow =
  | { kind: "fuzzy"; legacyKey: string; proposedNewKey: string; overlap: number }
  | { kind: "legacy-orphan"; legacyKey: string }
  | { kind: "new-orphan"; newKey: string };

function rowKey(row: ActionRow): string {
  return row.kind === "new-orphan" ? `new:${row.newKey}` : `legacy:${row.legacyKey}`;
}

interface ValidateEmployeesProps {
  comparisonId: string;
  nextStep: () => void;
  onBack: () => void;
}

export function ValidateEmployees({
  comparisonId,
  nextStep,
  onBack,
}: ValidateEmployeesProps) {
  const [saving, setSaving] = useState(false);
  const [pairings, setPairings] = useState<Map<string, string>>(new Map());
  const [skips, setSkips] = useState<Set<string>>(new Set());
  const [matchedOpen, setMatchedOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const savedPairingsRef = useRef<Map<string, string>>(new Map());
  const initializedForRef = useRef<string | null>(null);

  const { isPending: empMappingIsPending, data: empMapping } = ComparisonQueries.useComparisonEmployeeMapping(comparisonId);
  const { isPending: empPairsIsPending, data: empPairs } = ComparisonQueries.useComparisonEmployeePair(comparisonId);
  const { isPending: legacyIsPending, data: legacyEmployees } = ComparisonQueries.useComparisonSourceEmployees(comparisonId, 'legacy');
  const { isPending: newIsPending, data: newEmployees } = ComparisonQueries.useComparisonSourceEmployees(comparisonId, 'new');

  const isLoading = empMappingIsPending || empPairsIsPending || legacyIsPending || newIsPending;
  const matchMode = empMapping?.employee_match_mode;

  const legacyKeys = useMemo(() => (legacyEmployees ?? []).map((e) => e.key), [legacyEmployees]);
  const newKeys = useMemo(() => (newEmployees ?? []).map((e) => e.key), [newEmployees]);

  const { exactMatchedKeys, exactLegacyKeys, exactNewKeys } = useMemo(() => {
    const normalizedNewKeyMap = new Map(newKeys.map((k) => [normalizeEmployeeKey(k), k]));
    const normalizedLegacyKeyMap = new Map(legacyKeys.map((k) => [normalizeEmployeeKey(k), k]));
    const exactLegacyKeys = new Set(legacyKeys.filter((k) => normalizedNewKeyMap.has(normalizeEmployeeKey(k))));
    const exactNewKeys = new Set(newKeys.filter((k) => normalizedLegacyKeyMap.has(normalizeEmployeeKey(k))));
    return { exactMatchedKeys: [...exactLegacyKeys], exactLegacyKeys, exactNewKeys };
  }, [legacyKeys, newKeys]);

  const dbPairings = useMemo(
    () =>
      (empPairs ?? [])
        .filter((p): p is typeof p & { legacy_key: string; new_key: string } =>
          p.legacy_key !== null && p.new_key !== null
        )
        .map((p) => ({ legacyKey: p.legacy_key, newKey: p.new_key })),
    [empPairs]
  );

  const { unmatchedLegacy, unmatchedNew } = useMemo(() => {
    const pairedLegacyKeys = new Set((empPairs ?? []).map((p) => p.legacy_key));
    const pairedNewKeys = new Set((empPairs ?? []).map((p) => p.new_key));
    return {
      unmatchedLegacy: legacyKeys.filter((k) => !exactLegacyKeys.has(k) && !pairedLegacyKeys.has(k)),
      unmatchedNew: newKeys.filter((k) => !exactNewKeys.has(k) && !pairedNewKeys.has(k)),
    };
  }, [legacyKeys, newKeys, exactLegacyKeys, exactNewKeys, empPairs]);

  const { actionRows, initialPairings } = useMemo(() => {
    if (isLoading) return { actionRows: [] as ActionRow[], initialPairings: new Map<string, string>() };

    const savedPairingsData = (empPairs ?? []).filter(
      (p): p is typeof p & { legacy_key: string; new_key: string } =>
        p.legacy_key !== null && p.new_key !== null
    );
    const initialPairings = new Map<string, string>(savedPairingsData.map((p) => [p.legacy_key, p.new_key]));
    const claimedNewKeys = new Set<string>(savedPairingsData.map((p) => p.new_key));
    const rows: ActionRow[] = [];

    if (matchMode === "fuzzy") {
      const candidates: FuzzyMatchCandidate[] = computeFuzzyCandidatesFromKeys(unmatchedLegacy, unmatchedNew);

      const candidatesByLegacyKey = new Map<string, FuzzyMatchCandidate[]>();
      for (const c of candidates) {
        const list = candidatesByLegacyKey.get(c.legacy_key) ?? [];
        list.push(c);
        candidatesByLegacyKey.set(c.legacy_key, list);
      }
      for (const list of candidatesByLegacyKey.values()) {
        list.sort((a, b) => b.overlap - a.overlap);
      }

      const unapprovedBest = [...candidatesByLegacyKey.entries()]
        .filter(([lk]) => !initialPairings.has(lk))
        .map(([lk, list]) => ({ lk, list, bestOverlap: list[0]?.overlap ?? 0 }))
        .sort((a, b) => b.bestOverlap - a.bestOverlap);

      for (const { lk, list } of unapprovedBest) {
        const pick = list.find((c) => !claimedNewKeys.has(c.new_key));
        if (pick) {
          initialPairings.set(lk, pick.new_key);
          claimedNewKeys.add(pick.new_key);
        }
      }

      const candidateLegacyKeys = new Set(candidates.map((c) => c.legacy_key));
      const candidateNewKeys = new Set(candidates.map((c) => c.new_key));

      for (const [lk, list] of candidatesByLegacyKey) {
        const pairedNew = initialPairings.get(lk) ?? list[0]?.new_key ?? "";
        rows.push({ kind: "fuzzy", legacyKey: lk, proposedNewKey: pairedNew, overlap: list[0]?.overlap ?? 0 });
      }
      for (const lk of unmatchedLegacy) {
        if (!candidateLegacyKeys.has(lk)) rows.push({ kind: "legacy-orphan", legacyKey: lk });
      }
      for (const mk of unmatchedNew) {
        if (!candidateNewKeys.has(mk)) rows.push({ kind: "new-orphan", newKey: mk });
      }
    } else {
      for (const lk of unmatchedLegacy) rows.push({ kind: "legacy-orphan", legacyKey: lk });
      for (const mk of unmatchedNew) rows.push({ kind: "new-orphan", newKey: mk });
    }

    return { actionRows: rows, initialPairings };
  }, [isLoading, empPairs, matchMode, unmatchedLegacy, unmatchedNew]);

  useEffect(() => {
    if (isLoading || initializedForRef.current === comparisonId) return;
    initializedForRef.current = comparisonId;
    setPairings(initialPairings);
    savedPairingsRef.current = new Map(
      (empPairs ?? [])
        .filter((p): p is typeof p & { legacy_key: string } => p.legacy_key !== null)
        .map((p) => [p.legacy_key, p.id])
    );
  }, [isLoading, comparisonId, initialPairings, empPairs]);

  const pairedNewKeys = new Set(pairings.values());
  const pairedLegacyKeys = new Set(pairings.keys());

  const orphanLegacyKeys = new Set(
    actionRows.filter((r) => r.kind === "legacy-orphan").map((r) => r.legacyKey)
  );
  const orphanNewKeys = new Set(
    actionRows.filter((r) => r.kind === "new-orphan").map((r) => r.newKey)
  );
  const manuallyPaired = [...pairings.entries()]
    .filter(
      ([lk, mk]) =>
        (orphanLegacyKeys.has(lk) || orphanNewKeys.has(mk)) &&
        !skips.has(`legacy:${lk}`) &&
        !skips.has(`new:${mk}`)
    )
    .map(([lk, mk]) => ({ legacyKey: lk, newKey: mk }));

  function isResolved(row: ActionRow): boolean {
    if (skips.has(rowKey(row))) return true;
    if (row.kind === "new-orphan") return pairedNewKeys.has(row.newKey);
    return pairings.has(row.legacyKey);
  }

  const canProceed = actionRows.every(isResolved);

  function pairLegacy(legacyKey: string, newKey: string) {
    setPairings((prev) => {
      const n = new Map(prev);
      for (const [lk, mk] of n) {
        if (mk === newKey && lk !== legacyKey) n.delete(lk);
      }
      n.set(legacyKey, newKey);
      return n;
    });
    setSkips((prev) => { const n = new Set(prev); n.delete(`legacy:${legacyKey}`); return n; });
  }

  function unpairLegacy(legacyKey: string) {
    setPairings((prev) => { const n = new Map(prev); n.delete(legacyKey); return n; });
  }

  function pairNew(newKey: string, legacyKey: string) {
    setPairings((prev) => {
      const n = new Map(prev);
      for (const [lk, mk] of n) {
        if (mk === newKey) n.delete(lk);
      }
      n.set(legacyKey, newKey);
      return n;
    });
    setSkips((prev) => { const n = new Set(prev); n.delete(`new:${newKey}`); return n; });
  }

  function skipLegacy(legacyKey: string) {
    setPairings((prev) => { const n = new Map(prev); n.delete(legacyKey); return n; });
    setSkips((prev) => new Set([...prev, `legacy:${legacyKey}`]));
  }

  function skipNew(newKey: string) {
    setPairings((prev) => {
      const n = new Map(prev);
      for (const [lk, mk] of n) { if (mk === newKey) n.delete(lk); }
      return n;
    });
    setSkips((prev) => new Set([...prev, `new:${newKey}`]));
  }

  function unskip(key: string) {
    setSkips((prev) => { const n = new Set(prev); n.delete(key); return n; });
  }

  async function handleNext() {
    setSaving(true);
    setActionError(null);
    try {
      await Promise.all(
        [...savedPairingsRef.current.entries()].map(([, pairingId]) =>
          fetch(`/api/comparisons/${comparisonId}/employeePair/${pairingId}`, {
            method: "DELETE",
          })
        )
      );
      const results = await Promise.all(
        [...pairings.entries()].map(([legacy_key, new_key]) =>
          fetch(`/api/comparisons/${comparisonId}/employeePair`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ legacy_key, new_key }),
          })
        )
      );
      if (results.some((r) => !r.ok)) {
        setActionError("Failed to save pairings. Please try again.");
        return;
      }
      nextStep();
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <ValidateEmployeesSkeleton />;
  }

  const totalMatched = exactMatchedKeys.length + dbPairings.length + manuallyPaired.length;

  if (actionRows.length === 0 && totalMatched === 0) {
    return (
      <div className="flex flex-col gap-8">
        <p className="text-sm text-muted-foreground">All employees matched successfully.</p>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={handleNext}>Next</Button>
        </div>
      </div>
    );
  }

  const visibleActionRows = actionRows.filter((row) => {
    if (row.kind === "fuzzy") return true;
    const skipped = skips.has(rowKey(row));
    if (skipped) return true;
    if (row.kind === "legacy-orphan") return !pairings.has(row.legacyKey);
    return !pairedNewKeys.has(row.newKey);
  });

  return (
    <div className="flex flex-col gap-6">
      {visibleActionRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">Needs review</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pair or skip each employee to continue.</p>
          </div>
          <div className="rounded-md border overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 py-2 text-xs uppercase tracking-wide w-[40%]">Legacy</TableHead>
                  <TableHead className="px-4 py-2 text-xs uppercase tracking-wide w-[40%]">New</TableHead>
                  <TableHead className="px-4 py-2 w-[20%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleActionRows.map((row) => {
                  const key = rowKey(row);
                  const skipped = skips.has(key);

                  if (row.kind === "fuzzy") {
                    const currentNewKey = pairings.get(row.legacyKey) ?? "";
                    const available = unmatchedNew.filter(
                      (mk) => !pairedNewKeys.has(mk) || mk === currentNewKey
                    );

                    return (
                      <TableRow key={key} className={skipped ? "opacity-50" : ""}>
                        <TableCell className="px-4 py-3">
                          <span className="font-medium truncate">{row.legacyKey}</span>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {skipped ? (
                            <Badge variant="outline" className="text-xs">Skipped</Badge>
                          ) : (
                            <div className="flex items-center gap-2">
                              <select
                                value={currentNewKey}
                                onChange={(e) =>
                                  e.target.value
                                    ? pairLegacy(row.legacyKey, e.target.value)
                                    : unpairLegacy(row.legacyKey)
                                }
                                className="text-sm rounded border border-input bg-background px-2 py-1 flex-1"
                              >
                                <option value="">— Select match —</option>
                                {available.map((mk) => (
                                  <option key={mk} value={mk}>{mk}</option>
                                ))}
                              </select>
                              {currentNewKey && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {Math.round(tokenOverlap(row.legacyKey, currentNewKey) * 100)}%
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          {skipped ? (
                            <Button size="sm" variant="ghost" onClick={() => unskip(key)}>Undo</Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => skipLegacy(row.legacyKey)}>Skip</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  if (row.kind === "legacy-orphan") {
                    const currentNewKey = pairings.get(row.legacyKey) ?? "";
                    const available = unmatchedNew.filter(
                      (mk) => !pairedNewKeys.has(mk) || mk === currentNewKey
                    );

                    return (
                      <TableRow key={key} className={skipped ? "opacity-50" : ""}>
                        <TableCell className="px-4 py-3">
                          <span className="font-medium truncate">{row.legacyKey}</span>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {skipped ? (
                            <Badge variant="outline" className="text-xs">Skipped</Badge>
                          ) : available.length > 0 ? (
                            <select
                              value={currentNewKey}
                              onChange={(e) =>
                                e.target.value
                                  ? pairLegacy(row.legacyKey, e.target.value)
                                  : unpairLegacy(row.legacyKey)
                              }
                              className="text-sm rounded border border-input bg-background px-2 py-1 w-full"
                            >
                              <option value="">— Select New employee —</option>
                              {available.map((mk) => (
                                <option key={mk} value={mk}>{mk}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-muted-foreground">No available New employees</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          {skipped ? (
                            <Button size="sm" variant="ghost" onClick={() => unskip(key)}>Undo</Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => skipLegacy(row.legacyKey)}>Skip</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  // new-orphan
                  const currentPairedLegacyKey =
                    [...pairings.entries()].find(([, mk]) => mk === row.newKey)?.[0] ?? "";
                  const available = unmatchedLegacy.filter(
                    (lk) => !pairedLegacyKeys.has(lk) || lk === currentPairedLegacyKey
                  );

                  return (
                    <TableRow key={key} className={skipped ? "opacity-50" : ""}>
                      <TableCell className="px-4 py-3">
                        {skipped ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : available.length > 0 ? (
                          <select
                            value={currentPairedLegacyKey}
                            onChange={(e) => {
                              if (e.target.value) pairNew(row.newKey, e.target.value);
                            }}
                            className="text-sm rounded border border-input bg-background px-2 py-1 w-full"
                          >
                            <option value="">— Select Legacy employee —</option>
                            {available.map((lk) => (
                              <option key={lk} value={lk}>{lk}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-muted-foreground">No available Legacy employees</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="font-medium truncate">{row.newKey}</span>
                        {skipped && <Badge variant="outline" className="ml-2 text-xs">Skipped</Badge>}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        {skipped ? (
                          <Button size="sm" variant="ghost" onClick={() => unskip(key)}>Undo</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => skipNew(row.newKey)}>Skip</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {totalMatched > 0 && (
        <div className="rounded-md border overflow-hidden bg-card">
          <button
            type="button"
            onClick={() => setMatchedOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              {totalMatched} employee{totalMatched !== 1 ? "s" : ""} matched
            </span>
            <span className="text-xs text-muted-foreground">{matchedOpen ? "Hide" : "Show"}</span>
          </button>
          {matchedOpen && (
            <Table className="border-t">
              <TableBody>
                {exactMatchedKeys.map((key) => (
                  <TableRow key={key}>
                    <TableCell className="px-4 py-2.5 w-[40%]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 dark:text-green-400">✓</span>
                        <span>{key}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 w-[40%]">
                      <span className="text-muted-foreground">{key}</span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 w-[20%] text-right">
                      <Badge variant="outline" className="text-xs">Exact</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {dbPairings.map(({ legacyKey, newKey }) => (
                  <TableRow key={`db:${legacyKey}:${newKey}`}>
                    <TableCell className="px-4 py-2.5 w-[40%]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 dark:text-green-400">✓</span>
                        <span>{legacyKey}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 w-[40%]">
                      <span className="text-muted-foreground">{newKey}</span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 w-[20%] text-right">
                      <Badge variant="outline" className="text-xs">Paired</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {manuallyPaired.map(({ legacyKey, newKey }) => (
                  <TableRow key={`new:${legacyKey}:${newKey}`}>
                    <TableCell className="px-4 py-2.5 w-[40%]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 dark:text-green-400">✓</span>
                        <span>{legacyKey}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 w-[40%]">
                      <span className="text-muted-foreground">{newKey}</span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 w-[20%] text-right">
                      <Badge variant="outline" className="text-xs">Paired</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {!canProceed && actionRows.length > 0 && (
        <p className="text-xs text-muted-foreground">Pair or skip all employees above to continue.</p>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={saving}>Back</Button>
        <Button onClick={handleNext} disabled={!canProceed || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Next"}
        </Button>
      </div>
    </div>
  );
}

function ValidateEmployeesSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="rounded-md border overflow-hidden bg-card">
          <div className="border-b bg-muted/40 px-4 py-2 flex gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16 ml-auto" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-t flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-7 flex-1" />
              <Skeleton className="h-7 w-14" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}
