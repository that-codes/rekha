import type { FastifyInstance } from "fastify";
import { logsQuerySchema, processNameSchema } from "@rekha/shared";
import { requireAuth } from "../rbac/guards.js";
import { parse, clientIp } from "./util.js";
import { readBackwards, streamFile } from "../logs/filereader.js";

export async function logRoutes(app: FastifyInstance): Promise<void> {
  const { provider, rbac, audit } = app.services;

  app.get("/processes/:name/logs", { preHandler: requireAuth }, async (request, reply) => {
    const name = parse(processNameSchema, (request.params as { name: string }).name, reply);
    if (!name) return;
    if (!rbac.canDoProcessAction(request.auth!.eff, name, "view_logs")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const query = parse(logsQuerySchema, request.query, reply);
    if (!query) return;

    const desc = await provider.describe(name);
    if (!desc) return reply.code(404).send({ error: "not_found" });

    // 'all' and 'out' read stdout; 'err' reads stderr. (Live streaming merges both.)
    const stream: "out" | "err" = query.stream === "err" ? "err" : "out";
    const path = stream === "err" ? desc.logs.err : desc.logs.out;
    if (!path) return reply.send({ lines: [], nextCursor: null });

    const beforeOffset = query.cursor ? Number(query.cursor) : undefined;
    const result = await readBackwards(path, name, stream, {
      beforeOffset: Number.isFinite(beforeOffset) ? beforeOffset : undefined,
      limit: query.limit,
      q: query.q,
      level: query.level,
    });
    return reply.send({ lines: result.lines, nextCursor: result.nextCursor });
  });

  app.get("/processes/:name/logs/download", { preHandler: requireAuth }, async (request, reply) => {
    const name = parse(processNameSchema, (request.params as { name: string }).name, reply);
    if (!name) return;
    if (!rbac.canDoProcessAction(request.auth!.eff, name, "view_logs")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const q = request.query as { stream?: string };
    const stream: "out" | "err" = q.stream === "err" ? "err" : "out";
    const desc = await provider.describe(name);
    if (!desc) return reply.code(404).send({ error: "not_found" });
    const path = stream === "err" ? desc.logs.err : desc.logs.out;
    if (!path) return reply.code(404).send({ error: "no_log_file" });

    audit.log({ actorUserId: request.auth!.userId, action: "logs_download", targetType: "process", targetId: name, ip: clientIp(request), result: "ok", detail: { stream } });
    reply.header("Content-Type", "text/plain; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${name}-${stream}.log"`);
    return reply.send(streamFile(path));
  });
}
