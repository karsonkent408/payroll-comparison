import { createHono } from '@/server/api/util/hono'
import { sourcesRepo } from '@/server/db/repos/sources'
import { employeeMappingRepo } from '@/server/db/repos/employeeMapping'
import { suggestLegacyColumns } from '@/server/api/services/aiMapper'
import { zValidator } from '@hono/zod-validator'
import z from 'zod'
import { checkPermission } from '../middleware'

const router = createHono()

.post(
  '/:id/ai-map',
  zValidator('param', z.object({
    id: z.coerce.number()
  })),
  checkPermission('write'),
  async (c) => {
  const { id: comparisonId } = c.req.valid('param')
  const legacySource = await sourcesRepo.find(comparisonId, 'legacy')
  const newSource = await sourcesRepo.find(comparisonId, 'new')
  const legacyHeaders = legacySource?.headers ?? []
  const newHeaders = newSource?.headers ?? []

  const mapping = await employeeMappingRepo.getMapping(comparisonId)
  const existingEntries = (mapping?.entries ?? []).map((e) => ({
    new_columns: e.new_columns,
    label: e.label,
    category: e.category,
  }))

  const keyColumnsToExclude = mapping?.legacy_employee_key ?? []

  try {
    const result = await suggestLegacyColumns(legacyHeaders, newHeaders, existingEntries, keyColumnsToExclude, undefined, c.req.raw.signal)
    return c.json(result)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 422)
  }
})

export default router
