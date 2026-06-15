import { z } from "zod";

/** Persistent, non-secret configuration stored at ~/.rekha/config.json */
export const configSchema = z.object({
  /** Bind host. Defaults to loopback; expose via a reverse proxy. */
  host: z.string().default("127.0.0.1"),
  port: z.coerce.number().int().min(1).max(65535).default(9700),
  /** Proxy IPs/CIDRs whose X-Forwarded-* headers are trusted. Empty = trust none. */
  trustedProxies: z.array(z.string()).default([]),
  /** Metrics collection + retention (all in seconds unless noted). */
  metrics: z
    .object({
      pollIntervalSec: z.number().int().min(1).max(60).default(5),
      hostPollIntervalSec: z.number().int().min(1).max(120).default(10),
      retainRawHours: z.number().min(0.5).default(3),
      retain1mHours: z.number().min(1).default(48),
      retain1hDays: z.number().min(1).default(30),
      retain1dDays: z.number().min(1).default(365),
    })
    .default({}),
  /** Session lifetime controls (minutes). */
  session: z
    .object({
      idleTimeoutMin: z.number().int().min(1).default(30),
      absoluteTimeoutMin: z.number().int().min(5).default(720),
    })
    .default({}),
  /** Optional override for PM2 log directory (auto-detected per process otherwise). */
  pm2LogDir: z.string().optional(),
});

export type RekhaConfig = z.infer<typeof configSchema>;

export const DEFAULT_PORT = 9700;
export const SERVICE_NAME = "rekha";

export function defaultConfig(): RekhaConfig {
  return configSchema.parse({});
}
