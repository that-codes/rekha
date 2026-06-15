import type { DB } from "../db/client.js";

const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 60_000; // 1 min, doubles each lockout beyond threshold

export interface LockState {
  locked: boolean;
  lockedUntil: number | null;
}

/** Per-account brute-force throttling with exponential backoff. */
export class BruteForceGuard {
  constructor(private readonly db: DB) {}

  check(userId: number): LockState {
    const row = this.db
      .prepare("SELECT locked_until FROM users WHERE id = ?")
      .get(userId) as { locked_until: number | null } | undefined;
    const lockedUntil = row?.locked_until ?? null;
    if (lockedUntil && lockedUntil > Date.now()) {
      return { locked: true, lockedUntil };
    }
    return { locked: false, lockedUntil: null };
  }

  recordFailure(userId: number): LockState {
    const row = this.db
      .prepare("SELECT failed_login_count FROM users WHERE id = ?")
      .get(userId) as { failed_login_count: number } | undefined;
    const failures = (row?.failed_login_count ?? 0) + 1;

    let lockedUntil: number | null = null;
    if (failures >= MAX_ATTEMPTS) {
      const overage = failures - MAX_ATTEMPTS;
      const lockMs = BASE_LOCKOUT_MS * Math.pow(2, Math.min(overage, 6));
      lockedUntil = Date.now() + lockMs;
    }
    this.db
      .prepare("UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?")
      .run(failures, lockedUntil, userId);
    return { locked: lockedUntil !== null, lockedUntil };
  }

  recordSuccess(userId: number): void {
    this.db
      .prepare(
        "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?",
      )
      .run(Date.now(), userId);
  }
}
