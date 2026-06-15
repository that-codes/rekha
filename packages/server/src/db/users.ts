import type { Capability, SafeUser } from "@rekha/shared";
import type { DB } from "./client.js";

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  status: "active" | "disabled";
  role_id: number;
  totp_enabled: number;
  last_login_at: number | null;
  created_at: number;
}

export function getUserByEmail(db: DB, email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
    | UserRow
    | undefined;
}

export function getUserById(db: DB, id: number): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function getRoleByName(db: DB, name: string): { id: number; name: string } | undefined {
  return db.prepare("SELECT id, name FROM roles WHERE name = ?").get(name) as
    | { id: number; name: string }
    | undefined;
}

export function listRoles(db: DB): { id: number; name: string; description: string | null }[] {
  return db.prepare("SELECT id, name, description FROM roles ORDER BY name").all() as {
    id: number;
    name: string;
    description: string | null;
  }[];
}

function capabilitiesForRole(db: DB, roleId: number): Capability[] {
  const rows = db
    .prepare("SELECT capability FROM role_capabilities WHERE role_id = ?")
    .all(roleId) as { capability: Capability }[];
  return rows.map((r) => r.capability);
}

export function toSafeUser(db: DB, row: UserRow): SafeUser {
  const role = db.prepare("SELECT name FROM roles WHERE id = ?").get(row.role_id) as {
    name: string;
  };
  return {
    id: row.id,
    email: row.email,
    role: role.name,
    status: row.status,
    capabilities: capabilitiesForRole(db, row.role_id),
    mfaEnabled: row.totp_enabled === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export function listUsers(db: DB): SafeUser[] {
  const rows = db.prepare("SELECT * FROM users ORDER BY email").all() as UserRow[];
  return rows.map((r) => toSafeUser(db, r));
}

export function createUser(
  db: DB,
  email: string,
  passwordHash: string,
  roleId: number,
): number {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, status, role_id, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?, ?)`,
    )
    .run(email, passwordHash, roleId, now, now);
  return Number(info.lastInsertRowid);
}

export function updateUser(
  db: DB,
  id: number,
  fields: { roleId?: number; status?: "active" | "disabled" },
): void {
  const sets: string[] = ["updated_at = @now"];
  const params: Record<string, unknown> = { id, now: Date.now() };
  if (fields.roleId !== undefined) {
    sets.push("role_id = @roleId");
    params.roleId = fields.roleId;
  }
  if (fields.status !== undefined) {
    sets.push("status = @status");
    params.status = fields.status;
  }
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function setPasswordHash(db: DB, id: number, hash: string): void {
  db.prepare(
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
  ).run(hash, Date.now(), id);
}

export function deleteUser(db: DB, id: number): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function countAdmins(db: DB): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.name = 'admin' AND u.status = 'active'`,
      )
      .get() as { c: number }
  ).c;
}
