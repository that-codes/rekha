import pino, { type Logger } from "pino";
import type { LoadedConfig } from "./config.js";
import { openDatabase, type DB } from "./db/client.js";
import { seedRoles } from "./db/seed.js";
import { ColumnCipher } from "./crypto/aesgcm.js";
import { SessionStore } from "./auth/session.js";
import { BruteForceGuard } from "./auth/bruteforce.js";
import { RbacService } from "./rbac/service.js";
import { AuditLogger } from "./audit/logger.js";
import { LocalPm2Provider, type ProcessProvider } from "./pm2/provider.js";
import { Collector } from "./analytics/collector.js";
import { REKHA_VERSION } from "./version.js";

export interface Services {
  log: Logger;
  loaded: LoadedConfig;
  db: DB;
  cipher: ColumnCipher;
  sessions: SessionStore;
  bruteForce: BruteForceGuard;
  rbac: RbacService;
  audit: AuditLogger;
  provider: ProcessProvider;
  collector: Collector;
  version: string;
}

export function buildServices(loaded: LoadedConfig): Services {
  const log = pino({ name: "rekha", level: process.env.REKHA_LOG_LEVEL ?? "info" });
  const db = openDatabase(loaded.paths.db);
  // Keep built-in role capability sets in sync with code on every boot, so new
  // capabilities (e.g. view_dashboard) are backfilled onto existing system roles.
  seedRoles(db);
  const cipher = new ColumnCipher(loaded.secrets.dataKeyHex);
  const sessions = new SessionStore(db, {
    idleTimeoutMs: loaded.config.session.idleTimeoutMin * 60_000,
    absoluteTimeoutMs: loaded.config.session.absoluteTimeoutMin * 60_000,
  });
  const bruteForce = new BruteForceGuard(db);
  const rbac = new RbacService(db);
  const audit = new AuditLogger(db);
  const provider = new LocalPm2Provider(log);
  const collector = new Collector(db, provider, loaded.config, REKHA_VERSION, log);

  return {
    log,
    loaded,
    db,
    cipher,
    sessions,
    bruteForce,
    rbac,
    audit,
    provider,
    collector,
    version: REKHA_VERSION,
  };
}
