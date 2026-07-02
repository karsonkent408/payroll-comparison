import { createHono } from '@/server/api/util/hono'

const router = createHono()

.get('/health', (c) => c.json({ ok: true }))

.post('/issues', async (c) => {
  const { title, description, label } = await c.req.json() as {
    title: string
    description?: string
    label?: string
  }
  if (!title?.trim()) return c.json({ error: 'title is required' }, 400)

  try {
    const args = ['gh', 'issue', 'create', '--title', title.trim(), '--body', description ?? '']
    if (label) args.push('--label', label)
    const result = await Bun.$`${args}`.quiet()
    const url = result.stdout.toString().trim()
    return c.json({ url }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 502)
  }
})

export default router
