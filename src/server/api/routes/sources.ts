import { createHono } from '@/server/api/util/hono'
import { parseFile } from '@/server/api/services/fileParser'
import { sourcesRepo } from '@/server/db/repos/sources'
import { comparisonRepo } from '@/server/db/repos/comparisons'
import { employeeMappingRepo } from '@/server/db/repos/employeeMapping'
import { columnMappingRepo } from '@/server/db/repos/columnMapping'
import { diffHeaders } from '@/server/api/services/mappingEngine'
import { employeePairingRepo } from '@/server/db/repos/employeePairing'
import { serializeSourceCsv } from '@/server/api/services/sourceSerializer'
import { checkPermission } from '../middleware'
import { SourceUploadController } from '@/server/api/controllers/sourceUploadController'
import { zValidator } from '@hono/zod-validator'
import z from 'zod'

const VALID_TYPES = new Set(['legacy', 'new'])

const router = createHono()

.post(
  '/:id/sources/:type',
  zValidator('param', z.object({ id: z.coerce.number(), type: z.string()})),
  checkPermission('write'),
  zValidator('form', z.object({
    file: z.file(),
    legacy_provider: z.string().optional(),
    format_notes: z.string().optional(),
    expected_employee_count: z.coerce.number().int().positive().optional(),
  })),
  async (c) => {
  const { id: comparisonId, type } = c.req.valid('param')
  const { file, legacy_provider, format_notes, expected_employee_count } = c.req.valid('form')

  if (!VALID_TYPES.has(type)) {
    return c.json({ error: 'type must be "legacy" or "new"' }, 400)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const parsed = parseFile(buffer, file.name)
  if (!parsed.ok) return c.json({ error: parsed.error }, 422)

  const uploadController = new SourceUploadController()
  const source = await uploadController.upload({
    sourcesRepo,
    comparisonsRepo: comparisonRepo,
    comparison_id: comparisonId,
    type: type as 'legacy' | 'new',
    file_name: file.name,
    headers: parsed.headers,
    rows: parsed.rows,
    detectedTypes: parsed.detectedTypes,
    columnSections: parsed.columnSections,
    ...(legacy_provider !== undefined ? { legacy_provider } : {}),
    ...(format_notes !== undefined ? { format_notes } : {}),
    ...(expected_employee_count !== undefined ? { expected_employee_count } : {}),
  })

  const existingMapping = await employeeMappingRepo.getMapping(comparisonId)
  let headerDiff = null
  if (existingMapping) {
    headerDiff = diffHeaders(existingMapping, parsed.headers, type as 'legacy' | 'new')
    const keyCol = type === 'legacy' ? existingMapping.legacy_employee_key : existingMapping.new_employee_key
    await employeePairingRepo.prune(comparisonId, type as 'legacy' | 'new', parsed.rows, keyCol)

    const headerSet = new Set(parsed.headers)
    const updatedLegacyKeys = type === 'legacy'
      ? existingMapping.legacy_employee_key.filter(k => headerSet.has(k))
      : existingMapping.legacy_employee_key
    const updatedNewKeys = type === 'new'
      ? existingMapping.new_employee_key.filter(k => headerSet.has(k))
      : existingMapping.new_employee_key
    const updatedFirstName = type === 'new' && existingMapping.new_first_name_column && !headerSet.has(existingMapping.new_first_name_column)
      ? null
      : existingMapping.new_first_name_column
    const updatedLastName = type === 'new' && existingMapping.new_last_name_column && !headerSet.has(existingMapping.new_last_name_column)
      ? null
      : existingMapping.new_last_name_column

    const keysChanged =
      updatedLegacyKeys.length !== existingMapping.legacy_employee_key.length ||
      updatedNewKeys.length !== existingMapping.new_employee_key.length ||
      updatedFirstName !== existingMapping.new_first_name_column ||
      updatedLastName !== existingMapping.new_last_name_column

    if (keysChanged) {
      await employeeMappingRepo.upsert(comparisonId, {
        legacy_employee_key: updatedLegacyKeys,
        new_employee_key: updatedNewKeys,
        employee_match_mode: existingMapping.employee_match_mode as 'exact' | 'fuzzy',
        new_first_name_column: updatedFirstName,
        new_last_name_column: updatedLastName,
      })
      await employeePairingRepo.deleteAll(comparisonId)
    }

    const existingEntries = await columnMappingRepo.findByComparisonId(comparisonId)
    if (existingEntries) {
      const side = type === 'legacy' ? 'legacy_columns' : 'new_columns'
      const updatedEntries = existingEntries.map(e => ({
        ...e,
        [side]: e[side].filter((col: string) => headerSet.has(col)),
      }))
      const columnsChanged = updatedEntries.some((e, i) => e[side].length !== existingEntries[i][side].length)
      if (columnsChanged) {
        await columnMappingRepo.upsert(comparisonId, updatedEntries)
      }
    }
  }

  return c.json({ ...source, headerDiff }, 201)
})

.get(
  '/:id/sources/:type/download',
  zValidator('param', z.object({ id: z.coerce.number(), type: z.string()})),
  checkPermission('read'),
  async (c) => {
    const { id: comparisonId, type } = c.req.valid('param')

    if (!VALID_TYPES.has(type)) {
      return c.json({ error: 'type must be "legacy" or "new"' }, 400)
    }

    const source = await sourcesRepo.find(comparisonId, type as 'legacy' | 'new')
    if (!source) return c.json({ error: 'Source not found' }, 404)

    const csv = serializeSourceCsv(source.headers, source.rows)
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${source.file_name}"`,
      },
    })
})

.get(
  '/:id/sources',
  zValidator('param', z.object({ id: z.coerce.number() })),
  checkPermission('read'),
  async (c) => {
    const { id: comparisonId } = c.req.valid('param')
    const [legacy, newSource] = await Promise.all([
      sourcesRepo.find(comparisonId, 'legacy'),
      sourcesRepo.find(comparisonId, 'new'),
    ])
    const summarize = (s: typeof legacy) =>
      s ? { type: s.type, file_name: s.file_name, row_count: s.row_count, headers: s.headers, columnSections: s.columnSections, legacy_provider: s.legacy_provider, format_notes: s.format_notes } : null
    return c.json({ legacy: summarize(legacy), new: summarize(newSource) })
})

export default router
