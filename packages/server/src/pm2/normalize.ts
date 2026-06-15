import type { ProcessInfo, ProcessStatus } from "@rekha/shared";

/** PM2's process description is loosely typed; we read fields defensively. */
type RawProc = {
  name?: string;
  pm_id?: number;
  pid?: number;
  monit?: { cpu?: number; memory?: number };
  pm2_env?: Record<string, unknown>;
};

const STATUSES: ProcessStatus[] = [
  "online",
  "stopping",
  "stopped",
  "launching",
  "errored",
  "one-launch-status",
];

function toStatus(value: unknown): ProcessStatus {
  return STATUSES.includes(value as ProcessStatus)
    ? (value as ProcessStatus)
    : "unknown";
}

export function normalizeProcess(raw: RawProc): ProcessInfo {
  const env = (raw.pm2_env ?? {}) as Record<string, unknown>;
  const status = toStatus(env.status);
  const pmUptime = typeof env.pm_uptime === "number" ? env.pm_uptime : 0;
  const uptimeMs = status === "online" && pmUptime ? Date.now() - pmUptime : 0;

  const versioning = env.versioning as { revision?: string } | undefined;

  return {
    name: raw.name ?? "unknown",
    pmId: raw.pm_id ?? -1,
    status,
    cpu: raw.monit?.cpu ?? 0,
    memory: raw.monit?.memory ?? 0,
    uptimeMs,
    restarts: (env.restart_time as number) ?? 0,
    unstableRestarts: (env.unstable_restarts as number) ?? 0,
    pid: raw.pid ?? null,
    execMode: (env.exec_mode as string) ?? "fork_mode",
    instances: (env.instances as number) ?? 1,
    nodeVersion: (env.node_version as string) ?? null,
    version: (env.version as string) ?? versioning?.revision ?? null,
    env: (env.NODE_ENV as string) ?? null,
    cwd: (env.pm_cwd as string) ?? null,
  };
}

export function logPaths(raw: RawProc): { out: string | null; err: string | null } {
  const env = (raw.pm2_env ?? {}) as Record<string, unknown>;
  return {
    out: (env.pm_out_log_path as string) ?? null,
    err: (env.pm_err_log_path as string) ?? null,
  };
}
