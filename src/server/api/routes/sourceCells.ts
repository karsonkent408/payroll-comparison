import { createHono } from '@/server/api/util/hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { mappingEntries } from '@/server/db/schema'
import { broadcastToRoom } from '../util/party'
import { sourcesRepo } from '@/server/db/repos/sources'
import { employeeMappingRepo } from '@/server/db/repos/employeeMapping'
import { employeePairingRepo } from '@/server/db/repos/employeePairing'
import { runComparisonForEmployee } from '@/server/api/services/comparisonEngine'
import { compositeEmployeeKey } from '@/shared/lib/compositeEmployeeKey'
import { normalizeEmployeeKey } from '@/shared/lib/normalizeEmployeeKey'
import { checkPermission } from '../middleware'
import { db } from '@/server/db'

const router = createHono()

  .get(
    '/:id/sources/legacy/rows/:employeeKey',
    zValidator('param', z.object({ id: z.coerce.number(), employeeKey: z.string() })),
    checkPermission('read'),
    async (c) => {
      const { id: comparisonId, employeeKey } = c.req.valid('param')
      

      const legacySource = await sourcesRepo.find(comparisonId, 'legacy')
      if (!legacySource) return c.json({ error: 'Legacy source not found' }, 404)

      const storedMapping = await employeeMappingRepo.getMapping(comparisonId)
      const legacyKey = storedMapping?.legacy_employee_key ?? ['emp_id']

      const normalizedTarget = normalizeEmployeeKey(employeeKey)
      const row = legacySource.rows.find(
        (r) => normalizeEmployeeKey(compositeEmployeeKey(r, legacyKey)) === normalizedTarget
      )
      if (!row) return c.json({ error: 'Employee not found' }, 404)

      return c.json(row)
    }
  )

  .patch(
    '/:id/sources/legacy/cells',
    zValidator('param', z.object({ id: z.coerce.number().int() })),
    zValidator('json', z.object({ employeeKey: z.string(), columnName: z.string(), value: z.string() })),
    checkPermission('write'),
    async (c) => {
      const comparisonId = c.req.valid('param').id
      const u = c.get('user')

      const { employeeKey, columnName, value } = c.req.valid('json')

      const legacySource = await sourcesRepo.find(comparisonId, 'legacy')
      if (!legacySource) return c.json({ error: 'Legacy source not found' }, 404)

      const storedMapping = await employeeMappingRepo.getMapping(comparisonId)
      if (!storedMapping) return c.json({ error: 'ColumnMapping not found' }, 422)

      const normalizedTarget = normalizeEmployeeKey(employeeKey)
      const legacyRowIdx = legacySource.rows.findIndex(
        (r) => normalizeEmployeeKey(compositeEmployeeKey(r, storedMapping.legacy_employee_key)) === normalizedTarget
      )
      if (legacyRowIdx === -1) return c.json({ error: 'Employee not found in Legacy source' }, 404)

      const updatedRows = legacySource.rows.map((r, i) =>
        i === legacyRowIdx ? { ...r, [columnName]: value } : r
      )
      await sourcesRepo.patchRows(comparisonId, updatedRows)

      const newSource = await sourcesRepo.find(comparisonId, 'new')
      if (!newSource) return c.json({ error: 'New source not found' }, 422)

      const pairings = await employeePairingRepo.getMatched(comparisonId)
      const fuzzyNewKey = pairings.find(
        (p) => normalizeEmployeeKey(p.legacy_key) === normalizedTarget
      )?.new_key

      const normalizedNewTarget = normalizeEmployeeKey(fuzzyNewKey ?? employeeKey)
      const newRow = newSource.rows.find(
        (r) => normalizeEmployeeKey(compositeEmployeeKey(r, storedMapping.new_employee_key)) === normalizedNewTarget
      )
      if (!newRow) return c.json({ error: 'Employee not found in New source' }, 404)

      const legacyRow = updatedRows[legacyRowIdx]
      const engineMapping = {
        legacy_employee_key: storedMapping.legacy_employee_key,
        new_employee_key: storedMapping.new_employee_key,
        entries: storedMapping.entries.map((e) => ({
          legacy_columns: e.legacy_columns,
          new_columns: e.new_columns,
          tolerance: e.tolerance,
        })),
      }
      const entryResults = runComparisonForEmployee(legacyRow, newRow, engineMapping)

      const entryMap = new Map(
        storedMapping.entries.map((e) => [
          JSON.stringify([[...e.legacy_columns].sort(), [...e.new_columns].sort()]),
          e,
        ])
      )

      const pairing = await employeePairingRepo.findByLegacyKey(comparisonId, employeeKey)
      if (!pairing) return c.json({ error: 'No results found for this employee — run the comparison first' }, 422)

      const updatedBy = u.id
      const roomId = String(comparisonId)
      const results = []
      for (const result of entryResults) {
        const entryKey = JSON.stringify([
          [...result.entry.legacy_columns].sort(),
          [...result.entry.new_columns].sort(),
        ])
        const storedEntry = entryMap.get(entryKey)
        if (!storedEntry) continue

        const legacyBreakdownJson = result.legacy_breakdown ? JSON.stringify(result.legacy_breakdown) : null
        const newBreakdownJson = result.new_breakdown ? JSON.stringify(result.new_breakdown) : null
        const [savedRow] = await db
          .insert(mappingEntries)
          .values({
            comparison_id: comparisonId,
            employee_pairing_id: pairing.id,
            column_mapping_id: storedEntry.id,
            auto_status: result.auto_status,
            legacy_value: result.legacy_value,
            legacy_breakdown: legacyBreakdownJson,
            new_value: result.new_value,
            new_breakdown: newBreakdownJson,
            difference: result.difference,
          })
          .onConflictDoUpdate({
            target: [mappingEntries.comparison_id, mappingEntries.employee_pairing_id, mappingEntries.column_mapping_id],
            set: {
              auto_status: result.auto_status,
              legacy_value: result.legacy_value,
              legacy_breakdown: legacyBreakdownJson,
              new_value: result.new_value,
              new_breakdown: newBreakdownJson,
              difference: result.difference,
              updated_at: sql`(datetime('now'))`,
            },
          })
          .returning({ id: mappingEntries.id })

        const entryId = String(savedRow.id)
        broadcastToRoom(c.env, roomId, { type: 'edit', entryId, field: 'legacy_value', value: result.legacy_value, updatedBy })
        broadcastToRoom(c.env, roomId, { type: 'edit', entryId, field: 'new_value', value: result.new_value, updatedBy })
        broadcastToRoom(c.env, roomId, { type: 'edit', entryId, field: 'difference', value: result.difference, updatedBy })
        broadcastToRoom(c.env, roomId, { type: 'edit', entryId, field: 'auto_status', value: result.auto_status, updatedBy })

        results.push({
          column_entry_id: storedEntry.id,
          legacy_value: result.legacy_value,
          new_value: result.new_value,
          difference: result.difference,
          auto_status: result.auto_status,
        })
      }

      return c.json({ results })
    }
  )

export default router
