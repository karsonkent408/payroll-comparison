import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "node:net";

const PORT_CANDIDATES = [5173, 5174, 5175, 5176, 5177];

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = createConnection({ port, host: "127.0.0.1" });
    conn.once("connect", () => { conn.destroy(); resolve(false); });
    conn.once("error", () => resolve(true));
  });
}

async function findFreePort(candidates: number[]): Promise<number> {
  for (const port of candidates) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`All candidate ports in use: ${candidates.join(", ")}`);
}

const port = await findFreePort(PORT_CANDIDATES);
const url = `http://localhost:${port}`;

const envPath = join(import.meta.dir, "../.env");
let envContents = readFileSync(envPath, "utf8");

if (/^URL=.*/m.test(envContents)) {
  envContents = envContents.replace(/^URL=.*/m, `URL=${url}`);
} else {
  envContents = envContents.trimEnd() + `\nURL=${url}\n`;
}

if (/^PORT=.*/m.test(envContents)) {
  envContents = envContents.replace(/^PORT=.*/m, `PORT=${port}`);
} else {
  envContents = envContents.trimEnd() + `\nPORT=${port}\n`;
}

writeFileSync(envPath, envContents);

console.log(`Port ${port} is free — wrote URL=${url} and PORT=${port} to .env`);

console.log("Migrating DB...");
await Bun.$`bunx wrangler d1 migrations apply comparison_db --local`;

console.log("Seeding users...");
await Bun.$`bun run scripts/seed.ts`;

console.log("Start the dev server with: bun run dev");
