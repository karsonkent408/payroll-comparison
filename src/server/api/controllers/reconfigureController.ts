import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { canModify } from "@/lib/canModify";
import {
  collaboratorRepo,
  comparisonRepo,
  sourcesRepo,
  columnMappingRepo,
  resultRepo,
  employeePairingRepo,
  employeeMappingRepo,
} from "@/server/db/repos";
import { runComparison } from "@/server/api/services/comparisonEngine";
import { pairMatchedEntries } from "@/server/api/services/resolutionMatching";
import { compositeEmployeeKey } from "@/lib/compositeEmployeeKey";
import { normalizeEmployeeKey } from "@/lib/normalizeEmployeeKey";
import { comparisons, mappingEntries } from "@/server/db/schema";
import type { ReconfigureMapping } from "@/server/api/schemas/reconfigureSchema";
import type {
  ColumnMapping,
  StoredMappingEntry,
  ComparisonCategory,
} from "@/lib/types";
import { parseFile } from "@/server/api/services/fileParser";

type ParsedFile = {
  file_name: string;
  headers: string[];
  rows: Record<string, string>[];
  detectedTypes: Record<string, "number" | "string" | "date">;
};

type SavedStatus = {
  employee_pairing_id: string;
  old_column_mapping_id: string;
  manual_override: "resolved" | "unresolved" | null;
  note: string | null;
  employee_name: string | null;
};

export class ReconfigureController {
  async execute(opts: {
    comparisonId: number;
    user: { id: string; role: string | null };
    mapping: ReconfigureMapping;
    resetStatuses: boolean;
    resetNotes: boolean;
    legacyFile: File | null;
    newFile: File | null;
  }) {
    const { comparisonId, user, mapping, resetStatuses, resetNotes } = opts;

    const comparison = await comparisonRepo.find(comparisonId);
    if (!comparison) return { status: 404 as const, error: "Not found" };
    const collaborators = await collaboratorRepo.getAll(comparisonId);
    if (!canModify(user.role, user.id, collaborators))
      return { status: 403 as const, error: "Forbidden" };

    let newLegacy: ParsedFile | null = null;
    let newNew: ParsedFile | null = null;

    if (opts.legacyFile) {
      const parsed = parseFile(
        Buffer.from(await opts.legacyFile.arrayBuffer()),
        opts.legacyFile.name,
      );
      if (!parsed.ok) return { status: 422 as const, error: parsed.error };
      newLegacy = {
        file_name: opts.legacyFile.name,
        headers: parsed.headers,
        rows: parsed.rows,
        detectedTypes: parsed.detectedTypes,
      };
    }

    if (opts.newFile) {
      const parsed = parseFile(
        Buffer.from(await opts.newFile.arrayBuffer()),
        opts.newFile.name,
      );
      if (!parsed.ok) return { status: 422 as const, error: parsed.error };
      newNew = {
        file_name: opts.newFile.name,
        headers: parsed.headers,
        rows: parsed.rows,
        detectedTypes: parsed.detectedTypes,
      };
    }

    try {
      // --- Read phase ---
      const [oldEntries, pairingRows, legacySource, newSource] = await Promise.all([
        columnMappingRepo.findByComparisonId(comparisonId),
        employeePairingRepo.getMatched(comparisonId),
        sourcesRepo.find(comparisonId, "legacy"),
        sourcesRepo.find(comparisonId, "new"),
      ]);

      const savedStatuses: SavedStatus[] =
        oldEntries && oldEntries.length > 0
          ? await db
              .select({
                employee_pairing_id: mappingEntries.employee_pairing_id,
                old_column_mapping_id: mappingEntries.column_mapping_id,
                manual_override: mappingEntries.manual_override,
                note: mappingEntries.note,
                employee_name: mappingEntries.employee_name,
              })
              .from(mappingEntries)
              .where(eq(mappingEntries.comparison_id, comparisonId))
              .all()
          : [];

      // --- Compute phase ---
      const newEntryIds = mapping.entries.map(() => crypto.randomUUID());

      const entryMap = new Map<string, StoredMappingEntry>();
      const newEntriesForPairing: { id: string; legacy_columns: string[]; new_columns: string[] }[] = [];
      for (let i = 0; i < mapping.entries.length; i++) {
        const entry = mapping.entries[i];
        const id = newEntryIds[i];
        const key = JSON.stringify([
          [...entry.legacy_columns].sort(),
          [...entry.new_columns].sort(),
        ]);
        entryMap.set(key, {
          id,
          mapping_id: comparisonId,
          legacy_columns: entry.legacy_columns,
          new_columns: entry.new_columns,
          tolerance: entry.tolerance,
          category: entry.category as ComparisonCategory,
          display_order: entry.display_order,
          label: entry.label,
        });
        newEntriesForPairing.push({ id, legacy_columns: entry.legacy_columns, new_columns: entry.new_columns });
      }

      const pairs = pairMatchedEntries(oldEntries ?? [], newEntriesForPairing);
      const oldToNew = new Map(pairs.map(({ old: o, new: n }) => [o.id, n.id]));

      const existingMatchedPairings = new Map(pairingRows.map((p) => [p.legacy_key, p.id]));
      const approvedFuzzyPairs = pairingRows.length > 0
        ? new Map(pairingRows.map((p) => [p.legacy_key, p.new_key]))
        : undefined;

      const legacyRows = newLegacy?.rows ?? legacySource?.rows;
      const newRows = newNew?.rows ?? newSource?.rows;
      if (!legacyRows || !newRows) {
        return {
          status: 422 as const,
          error: "Both Sources must be uploaded before reconfiguring a comparison",
        };
      }

      const engineMapping: ColumnMapping = {
        legacy_employee_key: mapping.legacy_employee_key,
        new_employee_key: mapping.new_employee_key,
        employee_match_mode: mapping.employee_match_mode,
        entries: mapping.entries.map((e) => ({
          legacy_columns: e.legacy_columns,
          new_columns: e.new_columns,
          tolerance: e.tolerance,
        })),
      };

      const engineResult = runComparison(legacyRows, newRows, engineMapping, approvedFuzzyPairs);

      const newPairingIds = new Map<string, string>();
      for (const row of engineResult.matched) {
        if (!existingMatchedPairings.has(row.employee_key)) {
          newPairingIds.set(row.employee_key, crypto.randomUUID());
        }
      }

      const newNameMap = new Map<string, string>();
      const newFirstNameMap = new Map<string, string>();
      const newLastNameMap = new Map<string, string>();
      const firstCol = mapping.new_first_name_column ?? null;
      const lastCol = mapping.new_last_name_column ?? null;
      if (firstCol || lastCol) {
        const normNewToName = new Map<string, string>();
        const normNewToFirst = new Map<string, string>();
        const normNewToLast = new Map<string, string>();
        for (const row of newRows) {
          const key = compositeEmployeeKey(row, mapping.new_employee_key);
          if (!key) continue;
          const firstName = firstCol ? (row[firstCol] ?? null) : null;
          const lastName = lastCol ? (row[lastCol] ?? null) : null;
          const name = [firstName, lastName].filter(Boolean).join(" ");
          const normKey = normalizeEmployeeKey(key);
          if (name) {
            newNameMap.set(key, name);
            normNewToName.set(normKey, name);
          }
          if (firstName) {
            newFirstNameMap.set(key, firstName);
            normNewToFirst.set(normKey, firstName);
          }
          if (lastName) {
            newLastNameMap.set(key, lastName);
            normNewToLast.set(normKey, lastName);
          }
        }
        for (const row of legacyRows) {
          const legacyKey = compositeEmployeeKey(row, mapping.legacy_employee_key);
          if (!legacyKey) continue;
          const normKey = normalizeEmployeeKey(legacyKey);
          if (!newNameMap.has(legacyKey)) {
            const name = normNewToName.get(normKey);
            if (name) newNameMap.set(legacyKey, name);
          }
          if (!newFirstNameMap.has(legacyKey)) {
            const first = normNewToFirst.get(normKey);
            if (first) newFirstNameMap.set(legacyKey, first);
          }
          if (!newLastNameMap.has(legacyKey)) {
            const last = normNewToLast.get(normKey);
            if (last) newLastNameMap.set(legacyKey, last);
          }
        }
      }

      const statusRestoreStatements = savedStatuses.flatMap((s) => {
        const newColMapId = oldToNew.get(s.old_column_mapping_id);
        if (newColMapId === undefined) return [];
        const manual_override = resetStatuses ? null : s.manual_override;
        const note = resetNotes ? null : s.note;
        if (manual_override === null && note === null) return [];
        return [
          db
            .update(mappingEntries)
            .set({ manual_override, note })
            .where(
              and(
                eq(mappingEntries.comparison_id, comparisonId),
                eq(mappingEntries.employee_pairing_id, s.employee_pairing_id),
                eq(mappingEntries.column_mapping_id, newColMapId),
              ),
            ),
        ];
      });

      // --- Batch phase ---
      const sourceStatements = [
        ...(newLegacy
          ? [sourcesRepo.buildUpsertStatement({ comparison_id: comparisonId, type: "legacy", ...newLegacy })]
          : []),
        ...(newNew
          ? [sourcesRepo.buildUpsertStatement({ comparison_id: comparisonId, type: "new", ...newNew })]
          : []),
      ];

      await db.batch([
        db.update(comparisons).set({ setup_complete: 1 }).where(eq(comparisons.id, comparisonId)),
        ...sourceStatements,
        ...employeeMappingRepo.buildUpsertStatements(comparisonId, {
          legacy_employee_key: mapping.legacy_employee_key,
          new_employee_key: mapping.new_employee_key,
          employee_match_mode: mapping.employee_match_mode,
          new_first_name_column: mapping.new_first_name_column ?? null,
          new_last_name_column: mapping.new_last_name_column ?? null,
        }),
        ...columnMappingRepo.buildWriteStatements(comparisonId, mapping.entries, newEntryIds),
        ...resultRepo.buildPersistStatements(
          comparisonId,
          engineResult,
          existingMatchedPairings,
          newPairingIds,
          entryMap,
          newNameMap,
          newFirstNameMap,
          newLastNameMap,
        ),
        ...statusRestoreStatements,
      ]);

      const result = await resultRepo.load(comparisonId);
      return { status: 200 as const, data: result };
    } catch {
      return { status: 500 as const, error: "Reconfigure failed" };
    }
  }
}


export const reconfigureCntrl = new ReconfigureController()
