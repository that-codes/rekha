import { randomBytes } from "node:crypto";
import type { DB } from "../db/client.js";

export interface SessionRecord {
  id: string;
  userId: number;
  csrfSecret: string;
}

export interface SessionConfig {
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
}

/** Server-side session store backed by SQLite. Sessions are instantly revocable. */
export class SessionStore {
  constructor(
    private readonly db: DB,
    private readonly config: SessionConfig,
  ) {}

  create(userId: number, ip: string | null, userAgent: string | null): SessionRecord {
    const id = randomBytes(32).toString("base64url");
    const csrfSecret = randomBytes(24).toString("base64url");
    const now = Date.now();
    const expiresAt = Math.min(
      now + this.config.idleTimeoutMs,
      now + this.config.absoluteTimeoutMs,
    );
    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, csrf_secret, ip, user_agent, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, userId, csrfSecret, ip, userAgent, now, now, expiresAt);
    return { id, userId, csrfSecret };
  }

  /** Validates + slides a session, enforcing idle and absolute timeouts. */
  validate(id: string): SessionRecord | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as Record<string, number | string> | undefined;
    if (!row) return null;

    const now = Date.now();
    const createdAt = row.created_at as number;
    const expiresAt = row.expires_at as number;

    if (now > expiresAt || now > createdAt + this.config.absoluteTimeoutMs) {
      this.destroy(id);
      return null;
    }

    const newExpiry = Math.min(
      now + this.config.idleTimeoutMs,
      createdAt + this.config.absoluteTimeoutMs,
    );
    this.db
      .prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?")
      .run(now, newExpiry, id);

    return {
      id,
      userId: row.user_id as number,
      csrfSecret: row.csrf_secret as string,
    };
  }

  destroy(id: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  destroyAllForUser(userId: number): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  pruneExpired(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  }
}
