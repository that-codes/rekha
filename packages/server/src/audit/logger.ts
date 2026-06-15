import type { DB } from "../db/client.js";
import type { AuditEntry } from "@rekha/shared";

export interface AuditInput {
  actorUserId?: number | null;
  actorUsername?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  result: "ok" | "denied" | "fail";
  detail?: Record<string, unknown> | null;
}

export class AuditLogger {
  private readonly insert;

  constructor(private readonly db: DB) {
    this.insert = db.prepare(
      `INSERT INTO audit_log
         (ts, actor_user_id, actor_username, action, target_type, target_id, ip, user_agent, result, detail_json)
       VALUES (@ts, @actorUserId, @actorUsername, @action, @targetType, @targetId, @ip, @userAgent, @result, @detail)`,
    );
  }

  log(input: AuditInput): void {
    this.insert.run({
      ts: Date.now(),
      actorUserId: input.actorUserId ?? null,
      actorUsername: input.actorUsername ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      result: input.result,
      detail: input.detail ? JSON.stringify(input.detail) : null,
    });
  }

  query(filter: {
    actor?: string;
    action?: string;
    from?: number;
    to?: number;
    limit: number;
  }): AuditEntry[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = { limit: filter.limit };
    if (filter.actor) {
      clauses.push("actor_username LIKE @actor");
      params.actor = `%${filter.actor}%`;
    }
    if (filter.action) {
      clauses.push("action = @action");
      params.action = filter.action;
    }
    if (filter.from) {
      clauses.push("ts >= @from");
      params.from = filter.from;
    }
    if (filter.to) {
      clauses.push("ts <= @to");
      params.to = filter.to;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT * FROM audit_log ${where} ORDER BY ts DESC LIMIT @limit`,
      )
      .all(params) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as number,
      ts: r.ts as number,
      actorUserId: (r.actor_user_id as number) ?? null,
      actorUsername: (r.actor_username as string) ?? null,
      action: r.action as string,
      targetType: (r.target_type as string) ?? null,
      targetId: (r.target_id as string) ?? null,
      ip: (r.ip as string) ?? null,
      result: r.result as "ok" | "denied" | "fail",
      detail: r.detail_json ? JSON.parse(r.detail_json as string) : null,
    }));
  }
}
