import { eq } from 'drizzle-orm'
import { createHono } from '@/server/api/util/hono'
import { comparisons } from '@/server/db/schema'
import { runComparison } from '@/server/api/services/comparisonEngine'
import { sourcesRepo } from '@/server/db/repos/sources'
import { employeeMappingRepo } from '@/server/db/repos/employeeMapping'
import type { StoredMappingEntry } from '@/shared/lib/types'
import { resultRepo } from '@/server/db/repos/results'
import type { ColumnMapping } from '@/server/api/services/mappingEngine'
import { employeePairingRepo } from '@/server/db/repos/employeePairing'
import { compositeEmployeeKey } from '@/shared/lib/compositeEmployeeKey'
import { normalizeEmployeeKey } from '@/shared/lib/normalizeEmployeeKey'
import { zValidator } from '@hono/zod-validator'
import z from 'zod'
import { comparisonCntrl } from '../controllers/comparisonController'
import { checkPermission } from '../middleware'
import { db } from '@/server/db'

const router = createHono()

.post(
  '/:id/results/run',
  zValidator('param', z.object({ id: z.coerce.number() })),
  checkPermission('write'),
  async (c) => {
  const { id: comparisonId } = c.req.valid('param')
  const legacySource = await sourcesRepo.find(comparisonId, 'legacy')
  const newSource = await sourcesRepo.find(comparisonId, 'new')
  if (!legacySource || !newSource) {
    return c.json({ error: 'Both Sources must be uploaded before running a comparison' }, 422)
  }

  const storedMapping = await employeeMappingRepo.getMapping(comparisonId)
  if (!storedMapping) {
    return c.json({ error: 'A ColumnMapping must be defined before running a comparison' }, 422)
  }

  const engineMapping: ColumnMapping = {
    legacy_employee_key: storedMapping.legacy_employee_key,
    new_employee_key: storedMapping.new_employee_key,
    entries: storedMapping.entries.map((e) => ({
      legacy_columns: e.legacy_columns,
      new_columns: e.new_columns,
      tolerance: e.tolerance,
    })),
  }

  // --- Read phase ---
  const pairings = await employeePairingRepo.getMatched(comparisonId)
  const existingMatchedPairings = new Map(pairings.map((p) => [p.legacy_key, p.id]))
  const approvedFuzzyPairs = pairings.length > 0
    ? new Map(pairings.map((p) => [p.legacy_key, p.new_key]))
    : undefined

  // --- Compute phase ---
  const engineResult = runComparison(legacySource.rows, newSource.rows, engineMapping, approvedFuzzyPairs)

  const entryMap = new Map<string, StoredMappingEntry>()
  for (const entry of storedMapping.entries) {
    const key = JSON.stringify([[...entry.legacy_columns].sort(), [...entry.new_columns].sort()])
    entryMap.set(key, entry)
  }

  const newPairingIds = new Map<string, string>()
  for (const row of engineResult.matched) {
    if (!existingMatchedPairings.has(row.employee_key)) {
      newPairingIds.set(row.employee_key, crypto.randomUUID())
    }
  }

  const newNameMap = new Map<string, string>()
  const newFirstNameMap = new Map<string, string>()
  const newLastNameMap = new Map<string, string>()
  const firstCol = storedMapping.new_first_name_column
  const lastCol = storedMapping.new_last_name_column
  if (firstCol || lastCol) {
    const newKeyColumns = storedMapping.new_employee_key
    const normNewToName = new Map<string, string>()
    const normNewToFirst = new Map<string, string>()
    const normNewToLast = new Map<string, string>()
    for (const row of newSource.rows) {
      const key = compositeEmployeeKey(row, newKeyColumns)
      if (!key) continue
      const firstName = firstCol ? (row[firstCol] ?? null) : null
      const lastName = lastCol ? (row[lastCol] ?? null) : null
      const name = [firstName, lastName].filter(Boolean).join(" ")
      const normKey = normalizeEmployeeKey(key)
      if (name) {
        newNameMap.set(key, name)
        normNewToName.set(normKey, name)
      }
      if (firstName) {
        newFirstNameMap.set(key, firstName)
        normNewToFirst.set(normKey, firstName)
      }
      if (lastName) {
        newLastNameMap.set(key, lastName)
        normNewToLast.set(normKey, lastName)
      }
    }
    const legacyKeyColumns = storedMapping.legacy_employee_key
    for (const row of legacySource.rows) {
      const legacyKey = compositeEmployeeKey(row, legacyKeyColumns)
      if (!legacyKey) continue
      const normKey = normalizeEmployeeKey(legacyKey)
      if (!newNameMap.has(legacyKey)) {
        const name = normNewToName.get(normKey)
        if (name) newNameMap.set(legacyKey, name)
      }
      if (!newFirstNameMap.has(legacyKey)) {
        const first = normNewToFirst.get(normKey)
        if (first) newFirstNameMap.set(legacyKey, first)
      }
      if (!newLastNameMap.has(legacyKey)) {
        const last = normNewToLast.get(normKey)
        if (last) newLastNameMap.set(legacyKey, last)
      }
    }
  }

  // --- Batch phase ---
  await db.batch([
    db.update(comparisons).set({ setup_complete: 1 }).where(eq(comparisons.id, comparisonId)),
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
  ])

  return c.json(await resultRepo.load(comparisonId))
})

.get(
  '/:id/results',
  zValidator('param', z.object({ id: z.coerce.number()})),
  checkPermission('read'),
  async (c) => {
    const { id: comparisonId } = c.req.valid('param')
    const compResult = await comparisonCntrl.getComparison(comparisonId)
    if ('error' in compResult) return c.json({ error: compResult.error }, compResult.status)
    if (!compResult.data.setup_complete) return c.json({ error: 'No results found' }, 404)
    return c.json(await resultRepo.load(comparisonId))
})

export default router
