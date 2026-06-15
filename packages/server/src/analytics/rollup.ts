import type { DB } from "../db/client.js";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Rolls raw samples up into 1m buckets, then 1m->1h and 1h->1d. Each level
 * aggregates only buckets that are complete (older than one bucket width) and
 * not yet present in the target table, so it is cheap and idempotent.
 */
export function runRollups(db: DB): void {
  rollupRawToMinute(db);
  rollupBucket(db, "metrics_1m", "metrics_1h", HOUR);
  rollupBucket(db, "metrics_1h", "metrics_1d", DAY);
}

function rollupRawToMinute(db: DB): void {
  const cutoff = Math.floor((Date.now() - MINUTE) / MINUTE) * MINUTE;
  db.prepare(
    /* sql */ `
    INSERT OR REPLACE INTO metrics_1m
      (process_name, bucket_ts, cpu_avg, cpu_max, mem_avg, mem_max, samples, online_samples, restarts_delta)
    SELECT
      process_name,
      (ts / @width) * @width AS bucket_ts,
      AVG(cpu), MAX(cpu), CAST(AVG(mem) AS INTEGER), MAX(mem),
      COUNT(*),
      SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END),
      MAX(restarts) - MIN(restarts)
    FROM metrics_raw
    WHERE ts < @cutoff
    GROUP BY process_name, bucket_ts
  `,
  ).run({ width: MINUTE, cutoff });
}

function rollupBucket(
  db: DB,
  source: string,
  target: string,
  width: number,
): void {
  const cutoff = Math.floor((Date.now() - width) / width) * width;
  db.prepare(
    /* sql */ `
    INSERT OR REPLACE INTO ${target}
      (process_name, bucket_ts, cpu_avg, cpu_max, mem_avg, mem_max, samples, online_samples, restarts_delta)
    SELECT
      process_name,
      (bucket_ts / @width) * @width AS b,
      AVG(cpu_avg), MAX(cpu_max), CAST(AVG(mem_avg) AS INTEGER), MAX(mem_max),
      SUM(samples), SUM(online_samples), SUM(restarts_delta)
    FROM ${source}
    WHERE bucket_ts < @cutoff
    GROUP BY process_name, b
  `,
  ).run({ width, cutoff });
}
