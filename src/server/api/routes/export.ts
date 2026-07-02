import { createHono } from '@/server/api/util/hono'
import { eq, and } from 'drizzle-orm'
import { account } from '@/server/db/schema/auth-schema'
import { comparisonCntrl } from '@/server/api/controllers/comparisonController'
import { db } from '@/server/db'
import { env } from 'cloudflare:workers'

async function getFreshAccessToken(
  userId: string,
  googleClientId: string,
  googleClientSecret: string,
): Promise<string> {
  const acct = await db
    .select({
      accessToken: account.accessToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      refreshToken: account.refreshToken,
      scope: account.scope,
    })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'google')))
    .get()

  if (!acct) throw new Error('No Google account found')

  const isExpired =
    !acct.accessToken ||
    (acct.accessTokenExpiresAt != null && acct.accessTokenExpiresAt <= new Date())

  if (!isExpired) return acct.accessToken!

  if (!acct.refreshToken) throw new Error('Google access token expired and no refresh token available')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: acct.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google token refresh failed (${res.status}): ${body}`)
  }

  const { access_token, expires_in } = await res.json() as {
    access_token: string
    expires_in: number
  }

  const expiresAt = new Date(Date.now() + expires_in * 1000)

  await db.update(account)
    .set({ accessToken: access_token, accessTokenExpiresAt: expiresAt })
    .where(and(eq(account.userId, userId), eq(account.providerId, 'google')))
    .run()

  return access_token
}

import { comparisonExport } from '@/server/api/services/comparisonExport'
import { comparisonExportDynamic } from '@/server/api/services/comparisonExportDynamic'
import { comparisonExportCsv } from '@/server/api/services/comparisonExportCsv'
import { sheetsExport } from '@/server/api/services/sheetsExport'
import { sheetsExportDynamic } from '@/server/api/services/sheetsExportDynamic'
import { zValidator } from '@hono/zod-validator'
import z from 'zod'
import { checkPermission } from '../middleware'
import { employeeMappingRepo } from '@/server/db/repos/employeeMapping'
import { resultRepo } from '@/server/db/repos/results'
import { sourcesRepo } from '@/server/db/repos/sources'
import { employeePairingRepo } from '@/server/db/repos/employeePairing'

  const router = createHono()

  .get(
    '/:id/export',
    zValidator('param', z.object({ id: z.coerce.number() })),
    checkPermission('read'),
    async (c) => {
      const { id: comparisonId } = c.req.valid('param')
    const format = c.req.query('format') ?? 'xlsx'
    const mode = c.req.query('mode') ?? 'static'

    const compResult = await comparisonCntrl.getComparison(comparisonId)
    if ('error' in compResult) return c.json({ error: compResult.error }, compResult.status)
    const comparison = compResult.data

    if (comparison.status === 'setup') {
      return c.json({ error: 'Comparison has not been run yet' }, 422)
    }

    const mapping = await employeeMappingRepo.getMapping(comparisonId)
    const results = await resultRepo.load(comparisonId)
    if (!mapping || !results) return c.json({ error: 'Results not found' }, 404)

    const meta = { label: comparison.label, pay_period_start: comparison.pay_period_start, pay_period_end: comparison.pay_period_end }

    if (format === 'sheets') {
      const user = c.get('user')
      const acct = await db
        .select({ scope: account.scope })
        .from(account)
        .where(and(eq(account.userId, user.id), eq(account.providerId, 'google')))
        .get()

      const hasDriveScope = acct?.scope?.includes('drive.file') ?? false
      if (!hasDriveScope) {
        return c.json({ error: 'scope_missing', scope: 'drive.file' }, 403)
      }

      try {
        const accessToken = await getFreshAccessToken(user.id, env.GOOGLE_CLIENT_ID ?? "", env.GOOGLE_CLIENT_SECRET ?? "")
        if (mode === 'dynamic') {
          const newSource = await sourcesRepo.find(comparisonId, 'new')
          if (!newSource) return c.json({ error: 'New source not found' }, 404)
          const pairings = await employeePairingRepo.getMatched(comparisonId)
          const url = await sheetsExportDynamic(results, mapping, meta, newSource, pairings, accessToken)
          return c.json({ url })
        }
        const url = await sheetsExport(results, mapping, meta, accessToken)
        return c.json({ url })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('no refresh token')) {
          return c.json({ error: 'token_expired' }, 401)
        }
        return c.json({ error: 'sheets_api_error', message }, 502)
      }
    }

    if (format === 'csv') {
      const csv = comparisonExportCsv(results, mapping, meta)
      const filename = `${comparison.label} - ${comparison.pay_period_start} to ${comparison.pay_period_end}.csv`
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    if (mode === 'dynamic') {
      const newSource = await sourcesRepo.find(comparisonId, 'new')
      if (!newSource) return c.json({ error: 'New source not found' }, 404)
      const pairings = await employeePairingRepo.getMatched(comparisonId)
      const buf = comparisonExportDynamic(results, mapping, meta, newSource, pairings)
      const filename = `${comparison.label} - ${comparison.pay_period_start} to ${comparison.pay_period_end}.xlsx`
      return new Response(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        { headers: { 'Content-Disposition': `attachment; filename="${filename}"` } }
      )
    }

    const buf = comparisonExport(results, mapping, meta)
    const filename = `${comparison.label} - ${comparison.pay_period_start} to ${comparison.pay_period_end}.xlsx`
    return new Response(
      new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      { headers: { 'Content-Disposition': `attachment; filename="${filename}"` } }
    )
  })

export default router
