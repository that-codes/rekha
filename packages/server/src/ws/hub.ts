import type { WebSocket } from "ws";
import type { Logger } from "pino";
import { Capabilities } from "@rekha/shared";
import type { ProcessInfo, SystemOverview, WsServerMessage } from "@rekha/shared";
import type { Services } from "../services.js";
import type { LogPayload } from "../pm2/provider.js";
import { inferLevel, matchesLevel, matchesQuery } from "../logs/level.js";

interface LogFilter {
  stream: "out" | "err" | "all";
  level: string;
  q?: string;
}

interface Conn {
  socket: WebSocket;
  userId: number;
  alive: boolean;
  subs: Set<string>;
  logFilters: Map<string, LogFilter>;
}

const MAX_BUFFERED = 1 << 20; // 1 MiB — drop log lines for clients that can't keep up.

/**
 * Multiplexed WebSocket hub. One connection per browser tab; topic
 * subscriptions are re-authorized against live RBAC on every subscribe and at
 * send time, so permission changes take effect immediately.
 */
export class WsHub {
  private conns = new Set<Conn>();
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly log: Logger;

  constructor(private readonly services: Services) {
    this.log = services.log.child({ mod: "ws" });
  }

  start(): void {
    this.services.collector.on("tick", (snapshot) => this.onTick(snapshot));
    this.services.provider.on("log", (line: LogPayload) => this.onLog(line));
    this.heartbeat = setInterval(() => this.ping(), 30_000);
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.conns) c.socket.close();
    this.conns.clear();
  }

  register(socket: WebSocket, userId: number): void {
    const conn: Conn = {
      socket,
      userId,
      alive: true,
      subs: new Set(),
      logFilters: new Map(),
    };
    this.conns.add(conn);

    socket.on("pong", () => {
      conn.alive = true;
    });
    socket.on("message", (raw) => this.onMessage(conn, raw.toString()));
    socket.on("close", () => this.conns.delete(conn));
    socket.on("error", () => this.conns.delete(conn));

    // Push current snapshot immediately for snappy first paint (dashboard viewers only).
    const snap = this.services.collector.snapshot();
    const eff = this.services.rbac.getEffective(userId);
    if (snap.overview && eff && this.services.rbac.has(eff, Capabilities.VIEW_DASHBOARD)) {
      this.send(conn, { topic: "overview", event: "update", data: snap.overview });
    }
  }

  private onMessage(conn: Conn, raw: string): void {
    let msg: { op?: string; topic?: string; filters?: LogFilter };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.op === "ping") {
      this.send(conn, { topic: "system", event: "pong", data: null });
      return;
    }
    if (!msg.topic) return;

    if (msg.op === "subscribe") {
      if (!this.authorize(conn, msg.topic)) {
        this.send(conn, { topic: msg.topic, event: "denied", data: null });
        return;
      }
      conn.subs.add(msg.topic);
      if (msg.topic.endsWith(":logs")) {
        conn.logFilters.set(msg.topic, {
          stream: msg.filters?.stream ?? "all",
          level: msg.filters?.level ?? "all",
          q: msg.filters?.q,
        });
      }
    } else if (msg.op === "unsubscribe") {
      conn.subs.delete(msg.topic);
      conn.logFilters.delete(msg.topic);
    }
  }

  /** Re-checks RBAC for a topic using the freshest effective permissions. */
  private authorize(conn: Conn, topic: string): boolean {
    const eff = this.services.rbac.getEffective(conn.userId);
    if (!eff) return false;
    if (topic === "overview") return this.services.rbac.has(eff, Capabilities.VIEW_DASHBOARD);
    if (topic === "processes") return true;

    const m = /^process:(.+):(metrics|logs)$/.exec(topic);
    if (!m) return false;
    const name = m[1]!;
    if (m[2] === "metrics") return this.services.rbac.canViewProcess(eff, name);
    return this.services.rbac.canDoProcessAction(eff, name, "view_logs");
  }

  private onTick(snapshot: { processes: ProcessInfo[]; overview: SystemOverview | null }): void {
    const { rbac, db } = this.services;
    // Computed once per tick, only if an admin is watching the process list.
    let assignedNames: Set<string> | null = null;

    for (const conn of this.conns) {
      if (conn.subs.has("overview") && snapshot.overview) {
        this.send(conn, { topic: "overview", event: "update", data: snapshot.overview });
      }

      if (conn.subs.has("processes")) {
        const eff = rbac.getEffective(conn.userId);
        if (eff) {
          let list = snapshot.processes.filter((p) => rbac.canViewProcess(eff, p.name));
          if (rbac.isAdmin(eff)) {
            if (!assignedNames) {
              assignedNames = new Set(
                (db.prepare("SELECT DISTINCT process_name FROM process_permissions").all() as {
                  process_name: string;
                }[]).map((r) => r.process_name),
              );
            }
            list = list.map((p) => ({ ...p, assigned: assignedNames!.has(p.name) }));
          }
          this.send(conn, { topic: "processes", event: "update", data: list });
        }
      }

      for (const topic of conn.subs) {
        const m = /^process:(.+):metrics$/.exec(topic);
        if (!m) continue;
        const proc = snapshot.processes.find((p) => p.name === m[1]);
        if (proc) this.send(conn, { topic, event: "update", data: proc });
      }
    }
  }

  private onLog(line: LogPayload): void {
    const topic = `process:${line.processName}:logs`;
    const level = inferLevel(line.message, line.stream);
    for (const conn of this.conns) {
      if (!conn.subs.has(topic)) continue;
      const f = conn.logFilters.get(topic);
      if (!f) continue;
      if (f.stream !== "all" && f.stream !== line.stream) continue;
      if (!matchesLevel(level, f.level) || !matchesQuery(line.message, f.q)) continue;
      // Backpressure: skip clients that are too far behind rather than buffer.
      if (conn.socket.bufferedAmount > MAX_BUFFERED) continue;
      this.send(conn, {
        topic,
        event: "line",
        data: { ...line, level },
      });
    }
  }

  private ping(): void {
    for (const conn of this.conns) {
      if (!conn.alive) {
        conn.socket.terminate();
        this.conns.delete(conn);
        continue;
      }
      conn.alive = false;
      try {
        conn.socket.ping();
      } catch {
        this.conns.delete(conn);
      }
    }
  }

  private send(conn: Conn, msg: WsServerMessage): void {
    if (conn.socket.readyState !== conn.socket.OPEN) return;
    try {
      conn.socket.send(JSON.stringify(msg));
    } catch (err) {
      this.log.debug({ err }, "ws send failed");
    }
  }
}
