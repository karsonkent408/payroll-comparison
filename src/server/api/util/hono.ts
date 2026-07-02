import { Hono } from "hono";
import { user, session } from "@/server/db/schema/auth-schema";
import type { AppDb } from "@/server/db";

export type ContextUser = typeof user.$inferSelect;
export type ContextSession = typeof session.$inferSelect;
type Variables = { session: ContextSession; user: ContextUser };

export type AppEnv = {
  Bindings: Cloudflare.Env;
  Variables: Variables;
};

export function createHono() {
  return new Hono<AppEnv>();
}
