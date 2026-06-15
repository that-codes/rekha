// Provisions a local REKHA_HOME for development WITHOUT PM2 or the wizard.
// Usage:
//   REKHA_HOME=./.devhome node scripts/dev-setup.mjs [email] [password]
import { mkdirSync, existsSync } from "node:fs";

const email = (process.argv[2] ?? "admin@example.com").toLowerCase();
const password = process.argv[3] ?? "ChangeMe1234!";

const { paths, rekhaHome } = await import("../packages/server/dist/paths.js");
const { generateSecrets, writeSecrets } = await import("../packages/server/dist/crypto/keys.js");
const { writeConfig } = await import("../packages/server/dist/config.js");
const { openDatabase } = await import("../packages/server/dist/db/client.js");
const { seedRoles, createAdmin } = await import("../packages/server/dist/db/seed.js");
const { defaultConfig } = await import("../packages/shared/dist/index.js");

const home = rekhaHome();
const p = paths(home);
mkdirSync(home, { recursive: true, mode: 0o700 });
mkdirSync(p.backups, { recursive: true, mode: 0o700 });

if (!existsSync(p.secretKey)) writeSecrets(p.secretKey, generateSecrets());
if (!existsSync(p.config)) writeConfig(p.config, defaultConfig());

const db = openDatabase(p.db);
seedRoles(db);
try {
  await createAdmin(db, email, password);
  console.log(`Created admin "${email}".`);
} catch {
  console.log("Admin already exists — leaving it unchanged.");
}
db.close();

console.log(`\nProvisioned ${home}`);
console.log("Start the server with:");
console.log(`  REKHA_INSECURE_COOKIE=1 REKHA_HOME=${home} node packages/server/dist/main.js`);
console.log("Login:", email, "/", password);
