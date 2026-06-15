import {
  Capabilities,
  PROCESS_ACTION_COLUMN,
  type Capability,
  type ProcessAction,
} from "@rekha/shared";
import type { DB } from "../db/client.js";

export interface EffectivePermissions {
  userId: number;
  role: string;
  capabilities: Set<Capability>;
  /** process name -> set of granted actions */
  grants: Map<string, Set<ProcessAction>>;
}

/**
 * Resolves and caches a user's effective permissions. The cache is invalidated
 * explicitly whenever a user's role/grants change (see `invalidate`), so RBAC
 * changes take effect immediately — no stale access.
 */
export class RbacService {
  private cache = new Map<number, EffectivePermissions>();

  constructor(private readonly db: DB) {}

  invalidate(userId: number): void {
    this.cache.delete(userId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  getEffective(userId: number): EffectivePermissions | null {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const user = this.db
      .prepare(
        `SELECT u.id, u.status, r.name AS role
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = ?`,
      )
      .get(userId) as { id: number; status: string; role: string } | undefined;
    if (!user || user.status !== "active") return null;

    const caps = this.db
      .prepare(
        `SELECT rc.capability FROM role_capabilities rc
           JOIN users u ON u.role_id = rc.role_id WHERE u.id = ?`,
      )
      .all(userId) as { capability: Capability }[];

    const grantRows = this.db
      .prepare(`SELECT * FROM process_permissions WHERE user_id = ?`)
      .all(userId) as Record<string, unknown>[];

    const grants = new Map<string, Set<ProcessAction>>();
    for (const row of grantRows) {
      const actions = new Set<ProcessAction>();
      for (const [action, column] of Object.entries(PROCESS_ACTION_COLUMN)) {
        if (row[column]) actions.add(action as ProcessAction);
      }
      grants.set(row.process_name as string, actions);
    }

    const effective: EffectivePermissions = {
      userId,
      role: user.role,
      capabilities: new Set(caps.map((c) => c.capability)),
      grants,
    };
    this.cache.set(userId, effective);
    return effective;
  }

  has(eff: EffectivePermissions, capability: Capability): boolean {
    return eff.capabilities.has(capability);
  }

  /** Admins (manage_all_processes) see/act on everything. */
  private isSuper(eff: EffectivePermissions): boolean {
    return eff.capabilities.has(Capabilities.MANAGE_ALL_PROCESSES);
  }

  canViewProcess(eff: EffectivePermissions, name: string): boolean {
    if (this.isSuper(eff)) return true;
    return eff.grants.get(name)?.has("view") ?? false;
  }

  canDoProcessAction(
    eff: EffectivePermissions,
    name: string,
    action: ProcessAction,
  ): boolean {
    if (this.isSuper(eff)) return true;
    return eff.grants.get(name)?.has(action) ?? false;
  }

  /** Filters a list of process names down to those the user may view. */
  filterVisible(eff: EffectivePermissions, names: string[]): string[] {
    if (this.isSuper(eff)) return names;
    return names.filter((n) => eff.grants.get(n)?.has("view"));
  }

  isAdmin(eff: EffectivePermissions): boolean {
    return this.isSuper(eff);
  }
}
