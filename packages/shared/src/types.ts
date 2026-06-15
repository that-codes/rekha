import type { Capability, ProcessAction } from "./rbac.js";

export type ProcessStatus =
  | "online"
  | "stopping"
  | "stopped"
  | "launching"
  | "errored"
  | "one-launch-status"
  | "unknown";

/** Normalized PM2 process, decoupled from PM2's raw shape. */
export interface ProcessInfo {
  name: string;
  pmId: number;
  status: ProcessStatus;
  cpu: number;
  memory: number;
  uptimeMs: number;
  restarts: number;
  unstableRestarts: number;
  pid: number | null;
  execMode: string;
  instances: number;
  nodeVersion: string | null;
  version: string | null;
  env: string | null;
  cwd: string | null;
  /** True when no user has been granted this process yet (admin-only visibility). */
  assigned?: boolean;
}

export interface HostInfo {
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  pm2Version: string | null;
  rekhaVersion: string;
  cpuCount: number;
  totalMemory: number;
  uptimeSeconds: number;
}

export interface SystemOverview {
  totalProcesses: number;
  online: number;
  stopped: number;
  errored: number;
  totalCpu: number;
  totalMemory: number;
  totalRestarts: number;
  host: HostInfo;
  load: { one: number; five: number; fifteen: number };
  memory: { total: number; free: number; used: number };
}

export type MetricsWindow = "1h" | "24h" | "7d" | "30d";

export interface MetricPoint {
  ts: number;
  cpu: number;
  cpuMax?: number;
  memory: number;
  memoryMax?: number;
  availability?: number;
  restarts?: number;
}

export interface ProcessEvent {
  id: number;
  processName: string;
  type: "start" | "stop" | "restart" | "online" | "errored" | "exit";
  ts: number;
  exitCode: number | null;
  detail: Record<string, unknown> | null;
}

export interface CrashAnalytics {
  totalCrashes: number;
  unstableRestarts: number;
  lastCrashTs: number | null;
  availability: number;
  exitCodes: Record<string, number>;
}

export interface LogLine {
  ts: number;
  stream: "out" | "err";
  level: "info" | "warn" | "error" | "debug";
  message: string;
  processName: string;
}

export interface SafeUser {
  id: number;
  email: string;
  role: string;
  status: "active" | "disabled";
  capabilities: Capability[];
  mfaEnabled: boolean;
  lastLoginAt: number | null;
  createdAt: number;
}

export interface ProcessGrant {
  processName: string;
  actions: ProcessAction[];
}

/** A user who has been granted access to a specific process. */
export interface ProcessAccessEntry {
  userId: number;
  email: string;
  role: string;
  actions: ProcessAction[];
}

export interface AuditEntry {
  id: number;
  ts: number;
  actorUserId: number | null;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  result: "ok" | "denied" | "fail";
  detail: Record<string, unknown> | null;
}

/** Topics carried over the multiplexed WebSocket. */
export type WsTopic =
  | "overview"
  | `process:${string}:metrics`
  | `process:${string}:logs`;

export interface WsClientMessage {
  op: "subscribe" | "unsubscribe" | "ping";
  topic?: string;
  /** Log subscription filters. */
  filters?: { stream?: "out" | "err" | "all"; level?: string; q?: string };
}

export interface WsServerMessage<T = unknown> {
  topic: string;
  event: string;
  data: T;
}
