import os from "node:os";
import { createRequire } from "node:module";
import type { HostInfo } from "@rekha/shared";

const require = createRequire(import.meta.url);

let pm2Version: string | null = null;
try {
  // Variable specifier so esbuild keeps this a runtime require (pm2 is external).
  const pm2Pkg = "pm2/package.json";
  pm2Version = (require(pm2Pkg) as { version: string }).version;
} catch {
  pm2Version = null;
}

export function buildHostInfo(rekhaVersion: string): HostInfo {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    pm2Version,
    rekhaVersion,
    cpuCount: os.cpus().length,
    totalMemory: os.totalmem(),
    uptimeSeconds: Math.floor(os.uptime()),
  };
}

export interface HostSample {
  ts: number;
  load1: number;
  load5: number;
  load15: number;
  memTotal: number;
  memFree: number;
  cpuCount: number;
  uptimeS: number;
}

export function sampleHost(): HostSample {
  const [load1 = 0, load5 = 0, load15 = 0] = os.loadavg();
  return {
    ts: Date.now(),
    load1,
    load5,
    load15,
    memTotal: os.totalmem(),
    memFree: os.freemem(),
    cpuCount: os.cpus().length,
    uptimeS: Math.floor(os.uptime()),
  };
}
