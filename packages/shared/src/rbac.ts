/**
 * RBAC capability + role definitions. Single source of truth shared by
 * the server (enforcement) and the web app (UX gating only).
 */

/** System-level capabilities. Process-level access is handled separately. */
export const Capabilities = {
  MANAGE_USERS: "manage_users",
  MANAGE_ROLES: "manage_roles",
  MANAGE_SETTINGS: "manage_settings",
  VIEW_AUDIT: "view_audit",
  /** Access to the system-wide dashboard / overview. */
  VIEW_DASHBOARD: "view_dashboard",
  /** Grants visibility + all actions on every process, bypassing per-process grants. */
  MANAGE_ALL_PROCESSES: "manage_all_processes",
} as const;

export type Capability = (typeof Capabilities)[keyof typeof Capabilities];

export const ALL_CAPABILITIES: Capability[] = Object.values(Capabilities);

/** Per-process actions that can be granted to a user. */
export const ProcessActions = {
  VIEW: "view",
  VIEW_LOGS: "view_logs",
  START: "start",
  STOP: "stop",
  RESTART: "restart",
  RELOAD: "reload",
  DELETE: "delete",
} as const;

export type ProcessAction = (typeof ProcessActions)[keyof typeof ProcessActions];

export const ALL_PROCESS_ACTIONS: ProcessAction[] = Object.values(ProcessActions);

/** Built-in (system) roles, seeded on install. */
export const SystemRoles = {
  ADMIN: "admin",
  DEVELOPER: "developer",
} as const;

export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];

/** Default capability set assigned to each seeded role. */
export const DEFAULT_ROLE_CAPABILITIES: Record<SystemRole, Capability[]> = {
  [SystemRoles.ADMIN]: ALL_CAPABILITIES,
  [SystemRoles.DEVELOPER]: [],
};

/** Column names on process_permissions that map to each action. */
export const PROCESS_ACTION_COLUMN: Record<ProcessAction, string> = {
  [ProcessActions.VIEW]: "can_view",
  [ProcessActions.VIEW_LOGS]: "can_view_logs",
  [ProcessActions.START]: "can_start",
  [ProcessActions.STOP]: "can_stop",
  [ProcessActions.RESTART]: "can_restart",
  [ProcessActions.RELOAD]: "can_reload",
  [ProcessActions.DELETE]: "can_delete",
};
