import type { DB } from "../db/client.js";
import type { RekhaConfig } from "@rekha/shared";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Deletes samples/buckets/events older than their configured retention. */
export function runRetention(db: DB, config: RekhaConfig): void {
  const now = Date.now();
  const m = config.metrics;
  const del = (table: string, column: string, cutoff: number) =>
    db.prepare(`DELETE FROM ${table} WHERE ${column} < ?`).run(cutoff);

  del("metrics_raw", "ts", now - m.retainRawHours * HOUR);
  del("metrics_1m", "bucket_ts", now - m.retain1mHours * HOUR);
  del("metrics_1h", "bucket_ts", now - m.retain1hDays * DAY);
  del("metrics_1d", "bucket_ts", now - m.retain1dDays * DAY);
  del("host_metrics", "ts", now - m.retain1hDays * DAY);
  del("process_events", "ts", now - m.retain1dDays * DAY);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
}
