import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema/index';
import { env } from 'cloudflare:workers'

export const db = drizzle(env.DB, { schema })

export type AppDb = typeof db

