import {
  DEFAULT_ROLE_CAPABILITIES,
  SystemRoles,
  type SystemRole,
} from "@rekha/shared";
import type { DB } from "./client.js";
import { hashPassword } from "../auth/password.js";

/** Ensures the built-in roles + their capabilities exist. Idempotent. */
export function seedRoles(db: DB): void {
  const insertRole = db.prepare(
    "INSERT OR IGNORE INTO roles (name, is_system, description) VALUES (?, 1, ?)",
  );
  const getRole = db.prepare("SELECT id FROM roles WHERE name = ?");
  const insertCap = db.prepare(
    "INSERT OR IGNORE INTO role_capabilities (role_id, capability) VALUES (?, ?)",
  );

  const descriptions: Record<SystemRole, string> = {
    [SystemRoles.ADMIN]: "Full access to all processes, users, and settings.",
    [SystemRoles.DEVELOPER]: "Access limited to explicitly granted processes.",
  };

  const tx = db.transaction(() => {
    for (const role of Object.values(SystemRoles)) {
      insertRole.run(role, descriptions[role]);
      const row = getRole.get(role) as { id: number };
      for (const cap of DEFAULT_ROLE_CAPABILITIES[role]) {
        insertCap.run(row.id, cap);
      }
    }
  });
  tx();
}

/** Creates the initial admin account. Throws if any user already exists. */
export async function createAdmin(
  db: DB,
  email: string,
  password: string,
): Promise<void> {
  const count = (
    db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }
  ).c;
  if (count > 0) {
    throw new Error("Cannot seed admin: users already exist.");
  }
  const role = db
    .prepare("SELECT id FROM roles WHERE name = ?")
    .get(SystemRoles.ADMIN) as { id: number } | undefined;
  if (!role) throw new Error("Admin role missing — run seedRoles first.");

  const hash = await hashPassword(password);
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (email, password_hash, status, role_id, created_at, updated_at)
     VALUES (?, ?, 'active', ?, ?, ?)`,
  ).run(email, hash, role.id, now, now);
}
