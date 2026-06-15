import { existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { SERVICE_NAME, passwordSchema } from "@rekha/shared";
import { paths } from "@rekha/server/paths";
import { openDatabase, backupTo } from "@rekha/server/db/client";
import { hashPassword } from "@rekha/server/auth/password";
import { REKHA_VERSION } from "@rekha/server/version";
import { pm2, pm2ServiceExists } from "../pm2-admin.js";

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function backup(): string {
  const pths = paths();
  if (!existsSync(pths.db)) {
    console.error(pc.red("No database found — is Rekha installed?"));
    process.exit(1);
  }
  const dest = path.join(pths.backups, `rekha-${stamp()}.db`);
  const db = openDatabase(pths.db);
  backupTo(db, dest);
  db.close();
  if (existsSync(pths.config)) copyFileSync(pths.config, `${dest}.config.json`);
  console.log(pc.green(`Backup written to ${dest}`));
  return dest;
}

export async function restore(file: string): Promise<void> {
  const pths = paths();
  if (!existsSync(file)) {
    console.error(pc.red(`Backup file not found: ${file}`));
    process.exit(1);
  }
  const confirm = await p.confirm({
    message: `This overwrites the current database at ${pths.db}. Continue?`,
    initialValue: false,
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Aborted.");
    process.exit(0);
  }

  const wasRunning = pm2ServiceExists(SERVICE_NAME);
  if (wasRunning) pm2(["stop", SERVICE_NAME], { quiet: true });

  copyFileSync(file, pths.db);
  // Apply any pending migrations to the restored database.
  openDatabase(pths.db).close();

  if (wasRunning) pm2(["start", SERVICE_NAME], { quiet: true });
  console.log(pc.green("Restore complete."));
}

export function update(): void {
  console.log(pc.dim(`Current Rekha version: ${REKHA_VERSION}`));
  console.log("Backing up before applying migrations...");
  backup();
  const pths = paths();
  // openDatabase runs forward-only migrations.
  openDatabase(pths.db).close();
  if (pm2ServiceExists(SERVICE_NAME)) {
    pm2(["restart", SERVICE_NAME]);
  }
  console.log(pc.green("Update complete (migrations applied, service restarted)."));
}

export async function resetPassword(email?: string): Promise<void> {
  const pths = paths();
  if (!existsSync(pths.db)) {
    console.error(pc.red("No database found — is Rekha installed?"));
    process.exit(1);
  }
  const db = openDatabase(pths.db);

  const lookup = email?.trim().toLowerCase();
  let row: { id: number; email: string } | undefined;
  if (lookup) {
    row = db.prepare("SELECT id, email FROM users WHERE email = ?").get(lookup) as
      | { id: number; email: string }
      | undefined;
  } else {
    row = db
      .prepare(
        `SELECT u.id, u.email FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.name = 'admin' ORDER BY u.id ASC LIMIT 1`,
      )
      .get() as { id: number; email: string } | undefined;
  }
  if (!row) {
    console.error(pc.red(email ? `User "${email}" not found.` : "No admin user found."));
    db.close();
    process.exit(1);
  }

  p.intro(pc.bgYellow(pc.black(` Reset password for ${row.email} `)));
  const pw = await p.password({
    message: "New password",
    validate: (v) => (passwordSchema.safeParse(v).success ? undefined : "Does not meet strength requirements"),
  });
  if (p.isCancel(pw)) {
    db.close();
    p.cancel("Aborted.");
    process.exit(0);
  }

  const hash = await hashPassword(pw);
  db.prepare("UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?").run(hash, Date.now(), row.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
  db.close();
  p.outro(pc.green(`Password reset for ${row.email}.`));
}
