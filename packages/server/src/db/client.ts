import Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations.js";

export type DB = Database.Database;

/** Opens the SQLite database with production-friendly PRAGMAs and runs migrations. */
export function openDatabase(file: string): DB {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
  return db;
}

export function runMigrations(db: DB): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRow = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations")
    .get() as { v: number };
  let current = appliedRow.v;
  let applied = 0;

  const record = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const tx = db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, Date.now());
    });
    tx();
    current = migration.version;
    applied += 1;
  }
  return applied;
}

/** Performs a hot, consistent backup snapshot (no service downtime). */
export function backupTo(db: DB, destFile: string): void {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.prepare("VACUUM INTO ?").run(destFile);
}
