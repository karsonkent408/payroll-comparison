const gitName = (await Bun.$`git config user.name`.nothrow().text()).trim();
const gitEmail = (await Bun.$`git config user.email`.nothrow().text()).trim();

const systemUser = process.env.USER ?? process.env.USERNAME ?? "dev";
const name = gitName || systemUser;
const email = gitEmail || `${systemUser}@localhost`;

if (!name || !email) {
  throw new Error("Could not determine developer identity");
}

const id = crypto.randomUUID();
const now = Date.now();

const sql = `
INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at)
VALUES ("${id}", "${name}", "${email}", 1, ${now}, ${now});
`.trim();

console.log(`Seeding user: ${name} <${email}>`);
await Bun.$`bunx wrangler d1 execute comparison_db --command=${sql} --local`;
