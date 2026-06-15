import type {
  CrashAnalytics,
  MetricPoint,
  MetricsWindow,
  ProcessEvent,
} from "@rekha/shared";
import type { DB } from "../db/client.js";

const HOUR = 3_600_000;
const DAY = 86_400_000;

const WINDOW_CONFIG: Record<MetricsWindow, { table: string; rangeMs: number }> = {
  "1h": { table: "metrics_1m", rangeMs: HOUR },
  "24h": { table: "metrics_1m", rangeMs: 24 * HOUR },
  "7d": { table: "metrics_1h", rangeMs: 7 * DAY },
  "30d": { table: "metrics_1d", rangeMs: 30 * DAY },
};

export function getMetrics(
  db: DB,
  processName: string,
  window: MetricsWindow,
): MetricPoint[] {
  const { table, rangeMs } = WINDOW_CONFIG[window];
  const since = Date.now() - rangeMs;
  interface Row {
    bucket_ts: number;
    cpu_avg: number;
    cpu_max: number;
    mem_avg: number;
    mem_max: number;
    samples: number;
    online_samples: number;
    restarts_delta: number;
  }
  const rows = db
    .prepare(
      `SELECT bucket_ts, cpu_avg, cpu_max, mem_avg, mem_max, samples, online_samples, restarts_delta
         FROM ${table}
        WHERE process_name = ? AND bucket_ts >= ?
        ORDER BY bucket_ts ASC`,
    )
    .all(processName, since) as Row[];

  return rows.map((r) => ({
    ts: r.bucket_ts,
    cpu: round(r.cpu_avg),
    cpuMax: round(r.cpu_max),
    memory: r.mem_avg,
    memoryMax: r.mem_max,
    availability: r.samples > 0 ? round((r.online_samples / r.samples) * 100) : 0,
    restarts: r.restarts_delta,
  }));
}

export function getProcessEvents(
  db: DB,
  processName: string,
  limit = 100,
): ProcessEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM process_events WHERE process_name = ? ORDER BY ts DESC LIMIT ?`,
    )
    .all(processName, limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    processName: r.process_name as string,
    type: r.type as ProcessEvent["type"],
    ts: r.ts as number,
    exitCode: (r.exit_code as number) ?? null,
    detail: r.detail_json ? JSON.parse(r.detail_json as string) : null,
  }));
}

export function getCrashAnalytics(
  db: DB,
  processName: string,
  window: MetricsWindow,
): CrashAnalytics {
  const since = Date.now() - WINDOW_CONFIG[window].rangeMs;
  const events = db
    .prepare(
      `SELECT type, exit_code, ts FROM process_events
        WHERE process_name = ? AND ts >= ? AND type IN ('exit','errored','restart')`,
    )
    .all(processName, since) as { type: string; exit_code: number | null; ts: number }[];

  const exitCodes: Record<string, number> = {};
  let totalCrashes = 0;
  let lastCrashTs: number | null = null;
  for (const e of events) {
    if (e.type === "exit" || e.type === "errored") {
      totalCrashes += 1;
      lastCrashTs = Math.max(lastCrashTs ?? 0, e.ts);
      const code = e.exit_code === null ? "unknown" : String(e.exit_code);
      exitCodes[code] = (exitCodes[code] ?? 0) + 1;
    }
  }

  const avail = db
    .prepare(
      `SELECT SUM(samples) AS s, SUM(online_samples) AS o
         FROM metrics_1m WHERE process_name = ? AND bucket_ts >= ?`,
    )
    .get(processName, since) as { s: number | null; o: number | null };
  const availability =
    avail.s && avail.s > 0 ? round(((avail.o ?? 0) / avail.s) * 100) : 100;

  const unstable = db
    .prepare(
      `SELECT MAX(uptime_ms) AS u FROM metrics_raw WHERE process_name = ?`,
    )
    .get(processName) as { u: number | null };

  return {
    totalCrashes,
    unstableRestarts: unstable.u === null ? 0 : 0,
    lastCrashTs,
    availability,
    exitCodes,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
