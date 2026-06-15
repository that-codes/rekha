/**
 * Forward-only SQL migrations. Each entry runs once, inside a transaction,
 * and is recorded in schema_migrations. Never edit a shipped migration —
 * append a new one.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial",
    sql: /* sql */ `
      CREATE TABLE roles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        is_system   INTEGER NOT NULL DEFAULT 0,
        description TEXT
      );

      CREATE TABLE role_capabilities (
        role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        capability TEXT NOT NULL,
        PRIMARY KEY (role_id, capability)
      );

      CREATE TABLE users (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        username           TEXT NOT NULL UNIQUE,
        password_hash      TEXT NOT NULL,
        status             TEXT NOT NULL DEFAULT 'active',
        role_id            INTEGER NOT NULL REFERENCES roles(id),
        totp_secret_enc    TEXT,
        totp_enabled       INTEGER NOT NULL DEFAULT 0,
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until       INTEGER,
        last_login_at      INTEGER,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL
      );

      CREATE TABLE process_permissions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        process_name TEXT NOT NULL,
        can_view     INTEGER NOT NULL DEFAULT 1,
        can_view_logs INTEGER NOT NULL DEFAULT 0,
        can_start    INTEGER NOT NULL DEFAULT 0,
        can_stop     INTEGER NOT NULL DEFAULT 0,
        can_restart  INTEGER NOT NULL DEFAULT 0,
        can_reload   INTEGER NOT NULL DEFAULT 0,
        can_delete   INTEGER NOT NULL DEFAULT 0,
        granted_by   INTEGER REFERENCES users(id),
        created_at   INTEGER NOT NULL,
        UNIQUE (user_id, process_name)
      );
      CREATE INDEX idx_perm_user ON process_permissions(user_id);

      CREATE TABLE sessions (
        id           TEXT PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_secret  TEXT NOT NULL,
        ip           TEXT,
        user_agent   TEXT,
        created_at   INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at   INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE metrics_raw (
        process_name TEXT NOT NULL,
        ts           INTEGER NOT NULL,
        cpu          REAL NOT NULL,
        mem          INTEGER NOT NULL,
        status       TEXT NOT NULL,
        restarts     INTEGER NOT NULL,
        uptime_ms    INTEGER NOT NULL
      );
      CREATE INDEX idx_raw_name_ts ON metrics_raw(process_name, ts);

      CREATE TABLE metrics_1m (
        process_name  TEXT NOT NULL,
        bucket_ts     INTEGER NOT NULL,
        cpu_avg       REAL NOT NULL,
        cpu_max       REAL NOT NULL,
        mem_avg       INTEGER NOT NULL,
        mem_max       INTEGER NOT NULL,
        samples       INTEGER NOT NULL,
        online_samples INTEGER NOT NULL,
        restarts_delta INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (process_name, bucket_ts)
      );

      CREATE TABLE metrics_1h (
        process_name  TEXT NOT NULL,
        bucket_ts     INTEGER NOT NULL,
        cpu_avg       REAL NOT NULL,
        cpu_max       REAL NOT NULL,
        mem_avg       INTEGER NOT NULL,
        mem_max       INTEGER NOT NULL,
        samples       INTEGER NOT NULL,
        online_samples INTEGER NOT NULL,
        restarts_delta INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (process_name, bucket_ts)
      );

      CREATE TABLE metrics_1d (
        process_name  TEXT NOT NULL,
        bucket_ts     INTEGER NOT NULL,
        cpu_avg       REAL NOT NULL,
        cpu_max       REAL NOT NULL,
        mem_avg       INTEGER NOT NULL,
        mem_max       INTEGER NOT NULL,
        samples       INTEGER NOT NULL,
        online_samples INTEGER NOT NULL,
        restarts_delta INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (process_name, bucket_ts)
      );

      CREATE TABLE process_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        process_name TEXT NOT NULL,
        type         TEXT NOT NULL,
        ts           INTEGER NOT NULL,
        exit_code    INTEGER,
        detail_json  TEXT
      );
      CREATE INDEX idx_events_name_ts ON process_events(process_name, ts);

      CREATE TABLE host_metrics (
        ts        INTEGER PRIMARY KEY,
        load1     REAL NOT NULL,
        load5     REAL NOT NULL,
        load15    REAL NOT NULL,
        mem_total INTEGER NOT NULL,
        mem_free  INTEGER NOT NULL,
        cpu_count INTEGER NOT NULL,
        uptime_s  INTEGER NOT NULL
      );

      CREATE TABLE audit_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ts              INTEGER NOT NULL,
        actor_user_id   INTEGER,
        actor_username  TEXT,
        action          TEXT NOT NULL,
        target_type     TEXT,
        target_id       TEXT,
        ip              TEXT,
        user_agent      TEXT,
        result          TEXT NOT NULL,
        detail_json     TEXT
      );
      CREATE INDEX idx_audit_ts ON audit_log(ts);
      CREATE INDEX idx_audit_actor ON audit_log(actor_user_id);

      CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );

      CREATE TABLE password_reset_tokens (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at    INTEGER
      );
    `,
  },
  {
    version: 2,
    name: "use_email_identifier",
    // Switch the login identifier from username to email. RENAME COLUMN keeps
    // the UNIQUE constraint. Existing values are kept as-is.
    sql: /* sql */ `ALTER TABLE users RENAME COLUMN username TO email;`,
  },
];
