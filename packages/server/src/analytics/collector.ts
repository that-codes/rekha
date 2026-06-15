import { EventEmitter } from "node:events";
import type { Logger } from "pino";
import type { ProcessInfo, RekhaConfig, SystemOverview } from "@rekha/shared";
import type { DB } from "../db/client.js";
import type { ProcessProvider, ProcessEventPayload } from "../pm2/provider.js";
import { buildHostInfo, sampleHost } from "./host.js";
import { runRollups } from "./rollup.js";
import { runRetention } from "./retention.js";

/**
 * Owns periodic metric collection, event capture, rollups, and retention.
 * Emits "tick" with the latest snapshot so the WebSocket hub can fan out
 * real-time updates without re-querying PM2 per client.
 */
export class Collector extends EventEmitter {
  private timers: NodeJS.Timeout[] = [];
  private latest: ProcessInfo[] = [];
  private latestOverview: SystemOverview | null = null;

  private readonly insertRaw;
  private readonly insertEvent;
  private readonly insertHost;

  constructor(
    private readonly db: DB,
    private readonly provider: ProcessProvider,
    private readonly config: RekhaConfig,
    private readonly version: string,
    private readonly log: Logger,
  ) {
    super();
    this.insertRaw = db.prepare(
      `INSERT INTO metrics_raw (process_name, ts, cpu, mem, status, restarts, uptime_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.insertEvent = db.prepare(
      `INSERT INTO process_events (process_name, type, ts, exit_code, detail_json)
       VALUES (?, ?, ?, ?, ?)`,
    );
    this.insertHost = db.prepare(
      `INSERT OR REPLACE INTO host_metrics
         (ts, load1, load5, load15, mem_total, mem_free, cpu_count, uptime_s)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
  }

  start(): void {
    this.provider.on("event", (e: ProcessEventPayload) => this.onEvent(e));

    void this.poll();
    void this.pollHost();

    this.timers.push(
      setInterval(() => void this.poll(), this.config.metrics.pollIntervalSec * 1000),
      setInterval(
        () => void this.pollHost(),
        this.config.metrics.hostPollIntervalSec * 1000,
      ),
      setInterval(() => this.safe(() => runRollups(this.db), "rollup"), 60_000),
      setInterval(
        () => this.safe(() => runRetention(this.db, this.config), "retention"),
        3_600_000,
      ),
    );
  }

  snapshot(): { processes: ProcessInfo[]; overview: SystemOverview | null } {
    return { processes: this.latest, overview: this.latestOverview };
  }

  private async poll(): Promise<void> {
    try {
      const processes = await this.provider.list();
      const ts = Date.now();
      const tx = this.db.transaction((items: ProcessInfo[]) => {
        for (const p of items) {
          this.insertRaw.run(
            p.name,
            ts,
            p.cpu,
            p.memory,
            p.status,
            p.restarts,
            p.uptimeMs,
          );
        }
      });
      tx(processes);
      this.latest = processes;
      this.latestOverview = this.buildOverview(processes);
      this.emit("tick", { processes, overview: this.latestOverview });
    } catch (err) {
      this.log.warn({ err }, "metric poll failed");
    }
  }

  private async pollHost(): Promise<void> {
    try {
      const s = sampleHost();
      this.insertHost.run(
        s.ts,
        s.load1,
        s.load5,
        s.load15,
        s.memTotal,
        s.memFree,
        s.cpuCount,
        s.uptimeS,
      );
    } catch (err) {
      this.log.warn({ err }, "host poll failed");
    }
  }

  private onEvent(e: ProcessEventPayload): void {
    try {
      this.insertEvent.run(e.processName, e.type, e.ts, e.exitCode, null);
    } catch (err) {
      this.log.warn({ err }, "failed to record process event");
    }
  }

  private buildOverview(processes: ProcessInfo[]): SystemOverview {
    const host = buildHostInfo(this.version);
    const last = sampleHost();
    let online = 0,
      stopped = 0,
      errored = 0,
      cpu = 0,
      mem = 0,
      restarts = 0;
    for (const p of processes) {
      if (p.status === "online") online += 1;
      else if (p.status === "errored") errored += 1;
      else stopped += 1;
      cpu += p.cpu;
      mem += p.memory;
      restarts += p.restarts;
    }
    return {
      totalProcesses: processes.length,
      online,
      stopped,
      errored,
      totalCpu: Math.round(cpu * 100) / 100,
      totalMemory: mem,
      totalRestarts: restarts,
      host,
      load: { one: last.load1, five: last.load5, fifteen: last.load15 },
      memory: {
        total: last.memTotal,
        free: last.memFree,
        used: last.memTotal - last.memFree,
      },
    };
  }

  private safe(fn: () => void, label: string): void {
    try {
      fn();
    } catch (err) {
      this.log.warn({ err }, `${label} job failed`);
    }
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
