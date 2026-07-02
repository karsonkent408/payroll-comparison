import type { AppType } from '@/server/api'
import { hc } from 'hono/client'

export const apiClient = hc<AppType>(window.location.origin)
