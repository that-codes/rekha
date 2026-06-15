import { EventEmitter } from "node:events";
import type { Logger } from "pino";
import type { ProcessInfo } from "@rekha/shared";
import { Pm2Connection } from "./connection.js";
import { CommandQueue } from "./queue.js";
import { normalizeProcess, logPaths } from "./normalize.js";

export type LifecycleAction = "start" | "stop" | "restart" | "reload" | "delete";

export interface ProcessLogPaths {
  out: string | null;
  err: string | null;
}

export interface ProcessEventPayload {
  type: "start" | "stop" | "restart" | "online" | "errored" | "exit";
  processName: string;
  ts: number;
  exitCode: number | null;
}

export interface LogPayload {
  processName: string;
  stream: "out" | "err";
  message: string;
  ts: number;
}

/**
 * Abstraction over a source of PM2 processes. Phase 1 ships only the local
 * provider; a future remote-agent provider can implement the same interface to
 * enable a multi-server hub without touching the rest of the server.
 */
export interface ProcessProvider extends EventEmitter {
  list(): Promise<ProcessInfo[]>;
  describe(name: string): Promise<{ info: ProcessInfo; logs: ProcessLogPaths } | null>;
  act(name: string, action: LifecycleAction): Promise<void>;
  startEventStream(): Promise<void>;
  dispose(): void;
}

export class LocalPm2Provider extends EventEmitter implements ProcessProvider {
  private readonly connection: Pm2Connection;
  private readonly queue = new CommandQueue();
  private bus: { on: Function; close?: Function } | null = null;

  constructor(private readonly log: Logger) {
    super();
    this.connection = new Pm2Connection(log);
  }

  async list(): Promise<ProcessInfo[]> {
    return this.queue.run(async () => {
      const pm2 = await this.connection.ensure();
      return new Promise<ProcessInfo[]>((resolve, reject) => {
        pm2.list((err, list) => {
          if (err) {
            this.connection.markDisconnected();
            reject(err);
            return;
          }
          resolve((list ?? []).map((p) => normalizeProcess(p as never)));
        });
      });
    });
  }

  async describe(
    name: string,
  ): Promise<{ info: ProcessInfo; logs: ProcessLogPaths } | null> {
    return this.queue.run(async () => {
      const pm2 = await this.connection.ensure();
      return new Promise<{ info: ProcessInfo; logs: ProcessLogPaths } | null>(
        (resolve, reject) => {
          pm2.describe(name, (err, list) => {
            if (err) {
              reject(err);
              return;
            }
            const raw = (list ?? [])[0];
            if (!raw) {
              resolve(null);
              return;
            }
            resolve({
              info: normalizeProcess(raw as never),
              logs: logPaths(raw as never),
            });
          });
        },
      );
    });
  }

  async act(name: string, action: LifecycleAction): Promise<void> {
    return this.queue.run(async () => {
      const pm2 = await this.connection.ensure();
      return new Promise<void>((resolve, reject) => {
        const cb = (err: Error | null) => (err ? reject(err) : resolve());
        switch (action) {
          case "start":
            pm2.start(name, cb);
            break;
          case "stop":
            pm2.stop(name, cb);
            break;
          case "restart":
            pm2.restart(name, cb);
            break;
          case "reload":
            pm2.reload(name, cb);
            break;
          case "delete":
            pm2.delete(name, cb);
            break;
        }
      });
    });
  }

  async startEventStream(): Promise<void> {
    const pm2 = await this.connection.ensure();
    await new Promise<void>((resolve, reject) => {
      // launchBus exists on the pm2 module but is missing from the bundled types.
      (pm2 as unknown as { launchBus: Function }).launchBus(
        (err: Error | null, bus: { on: Function; close?: Function }) => {
          if (err) {
            reject(err);
            return;
          }
          this.bus = bus;
          bus.on("process:event", (packet: Record<string, unknown>) => {
            const proc = (packet.process ?? {}) as Record<string, unknown>;
            const payload: ProcessEventPayload = {
              type: mapEvent(packet.event as string),
              processName: (proc.name as string) ?? "unknown",
              ts: (packet.at as number) ?? Date.now(),
              exitCode: (proc.exit_code as number) ?? null,
            };
            this.emit("event", payload);
          });
          for (const stream of ["log:out", "log:err"] as const) {
            bus.on(stream, (packet: Record<string, unknown>) => {
              const proc = (packet.process ?? {}) as Record<string, unknown>;
              const payload: LogPayload = {
                processName: (proc.name as string) ?? "unknown",
                stream: stream === "log:out" ? "out" : "err",
                message: String(packet.data ?? "").replace(/\n$/, ""),
                ts: (packet.at as number) ?? Date.now(),
              };
              this.emit("log", payload);
            });
          }
          resolve();
        },
      );
    });
  }

  dispose(): void {
    this.bus?.close?.();
    this.connection.disconnect();
  }
}

function mapEvent(event: string): ProcessEventPayload["type"] {
  switch (event) {
    case "start":
    case "online":
      return "online";
    case "stop":
      return "stop";
    case "restart":
      return "restart";
    case "exit":
      return "exit";
    case "errored":
      return "errored";
    default:
      return "start";
  }
}
