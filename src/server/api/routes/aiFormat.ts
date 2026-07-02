import { createHono } from '@/server/api/util/hono'
import { formatSourceStreaming, refineSource } from '@/server/api/services/aiFormatter'
import { parseFile } from '@/server/api/services/fileParser'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod';
import { requireUser } from '../middleware';
import type { FormatResult } from '@/shared/lib/types';

const router = createHono()
.use('*', requireUser())

.post(
  '/source',
  zValidator('form', z.object({
    file: z.file(),
    provider: z.string().optional(),
    employeeCount: z.string().optional(),
    notes: z.string().optional(),
    priorResponse: z.string().optional(),
    answers: z.string().optional(),
  })),
  async (c) => {
    const { file, provider, employeeCount, notes, priorResponse, answers } = c.req.valid('form')
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'file field is required' }, 400)
    }
    const buffer = Buffer.from(await file.arrayBuffer())

    const context = provider
      ? {
          provider,
          employeeCount: employeeCount !== undefined ? Number(employeeCount) : undefined,
          notes,
        }
      : undefined

    const encoder = new TextEncoder()
    const sseState = { enqueue: (_c: Uint8Array) => {}, close: () => {} }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        sseState.enqueue = (chunk) => controller.enqueue(chunk)
        sseState.close = () => controller.close()
      },
    })

    const send = (event: object) => {
      sseState.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    }

    const signal = c.req.raw.signal

    void (async () => {
      try {
        const result = await formatSourceStreaming(
          buffer, file.name, context, priorResponse, answers, undefined, signal,
          (delta) => send({ type: 'thinking', text: delta }),
        )
        send({ type: 'result', ...buildResponse(result) })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        send({ type: 'error', error: (err as Error).message })
      } finally {
        sseState.close()
      }
    })()

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  }
)

.post(
  '/refine',
  zValidator('json', z.object({
    csv: z.string().min(1),
    instructions: z.string().min(1),
    provider: z.string().optional(),
    employeeCount: z.number().optional(),
    notes: z.string().optional(),
  })),
  async (c) => {
    const { csv, instructions, provider, employeeCount, notes } = c.req.valid('json')

    const context = provider
      ? { provider, employeeCount, notes }
      : undefined

    try {
      const result = await refineSource(csv, instructions, context, undefined, c.req.raw.signal)
      return c.json(buildResponse(result))
    } catch (err) {
      return c.json({ error: (err as Error).message }, 422)
    }
  }
)

function buildResponse(result: FormatResult) {
  if (result.status === 'needs_input') {
    return result
  }

  const parsed = parseFile(Buffer.from(result.csv), 'output.csv')
  const headers = parsed.ok ? parsed.headers : []
  const rows = parsed.ok ? parsed.rows : []

  return { ...result, headers, rows }
}

export default router
