import { defineConfig } from "drizzle-kit";
import { readdirSync } from "fs";

const d1Dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const [dbFile] = readdirSync(d1Dir).filter(
  (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite"
);

if (!dbFile) throw new Error(`No local D1 SQLite file found in ${d1Dir}. Run 'bun run dev' first to initialize it.`);

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: `${d1Dir}/${dbFile}`,
  },
});
