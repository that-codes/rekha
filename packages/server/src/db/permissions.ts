import {
  ALL_PROCESS_ACTIONS,
  PROCESS_ACTION_COLUMN,
  type ProcessAccessEntry,
  type ProcessAction,
  type ProcessGrant,
} from "@rekha/shared";
import type { DB } from "./client.js";

export function getGrants(db: DB, userId: number): ProcessGrant[] {
  const rows = db
    .prepare("SELECT * FROM process_permissions WHERE user_id = ?")
    .all(userId) as Record<string, unknown>[];
  return rows.map((row) => {
    const actions: ProcessAction[] = [];
    for (const action of ALL_PROCESS_ACTIONS) {
      if (row[PROCESS_ACTION_COLUMN[action]]) actions.push(action);
    }
    return { processName: row.process_name as string, actions };
  });
}

/** Replaces a user's full grant set in one transaction. */
export function setGrants(
  db: DB,
  userId: number,
  grantedBy: number,
  grants: { processName: string; actions: string[] }[],
): void {
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM process_permissions WHERE user_id = ?").run(userId);
    const stmt = db.prepare(
      `INSERT INTO process_permissions
        (user_id, process_name, can_view, can_view_logs, can_start, can_stop, can_restart, can_reload, can_delete, granted_by, created_at)
       VALUES (@user, @name, @view, @logs, @start, @stop, @restart, @reload, @delete, @by, @now)`,
    );
    for (const g of grants) {
      if (g.actions.length === 0) continue;
      const has = (a: ProcessAction) => (g.actions.includes(a) ? 1 : 0);
      // Granting any action implies visibility.
      stmt.run({
        user: userId,
        name: g.processName,
        view: 1,
        logs: has("view_logs"),
        start: has("start"),
        stop: has("stop"),
        restart: has("restart"),
        reload: has("reload"),
        delete: has("delete"),
        by: grantedBy,
        now,
      });
    }
  });
  tx();
}

/** Lists the users who have access to a single process, with their actions. */
export function listProcessAccess(db: DB, processName: string): ProcessAccessEntry[] {
  const rows = db
    .prepare(
      `SELECT pp.*, u.email AS email, r.name AS role
         FROM process_permissions pp
         JOIN users u ON u.id = pp.user_id
         JOIN roles r ON r.id = u.role_id
        WHERE pp.process_name = ?
        ORDER BY u.email`,
    )
    .all(processName) as Record<string, unknown>[];
  return rows.map((row) => {
    const actions: ProcessAction[] = [];
    for (const action of ALL_PROCESS_ACTIONS) {
      if (row[PROCESS_ACTION_COLUMN[action]]) actions.push(action);
    }
    return {
      userId: row.user_id as number,
      email: row.email as string,
      role: row.role as string,
      actions,
    };
  });
}

/**
 * Upserts a single user's access to one process. An empty action list removes
 * the grant entirely. Granting any action implies view.
 */
export function setProcessAccess(
  db: DB,
  userId: number,
  processName: string,
  actions: string[],
  grantedBy: number,
): void {
  if (actions.length === 0) {
    db.prepare("DELETE FROM process_permissions WHERE user_id = ? AND process_name = ?").run(
      userId,
      processName,
    );
    return;
  }
  const has = (a: ProcessAction) => (actions.includes(a) ? 1 : 0);
  db.prepare(
    `INSERT INTO process_permissions
       (user_id, process_name, can_view, can_view_logs, can_start, can_stop, can_restart, can_reload, can_delete, granted_by, created_at)
     VALUES (@user, @name, 1, @logs, @start, @stop, @restart, @reload, @delete, @by, @now)
     ON CONFLICT(user_id, process_name) DO UPDATE SET
       can_view = 1,
       can_view_logs = excluded.can_view_logs,
       can_start = excluded.can_start,
       can_stop = excluded.can_stop,
       can_restart = excluded.can_restart,
       can_reload = excluded.can_reload,
       can_delete = excluded.can_delete`,
  ).run({
    user: userId,
    name: processName,
    logs: has("view_logs"),
    start: has("start"),
    stop: has("stop"),
    restart: has("restart"),
    reload: has("reload"),
    delete: has("delete"),
    by: grantedBy,
    now: Date.now(),
  });
}
