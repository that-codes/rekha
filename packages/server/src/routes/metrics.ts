import type { FastifyInstance } from "fastify";
import { metricsQuerySchema, processNameSchema } from "@rekha/shared";
import { requireAuth } from "../rbac/guards.js";
import { parse } from "./util.js";
import { getMetrics, getProcessEvents, getCrashAnalytics } from "../analytics/query.js";

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  const { db, rbac } = app.services;

  app.get("/processes/:name/metrics", { preHandler: requireAuth }, async (request, reply) => {
    const name = parse(processNameSchema, (request.params as { name: string }).name, reply);
    if (!name) return;
    if (!rbac.canViewProcess(request.auth!.eff, name)) return reply.code(403).send({ error: "forbidden" });
    const query = parse(metricsQuerySchema, request.query, reply);
    if (!query) return;
    return reply.send({ window: query.window, points: getMetrics(db, name, query.window) });
  });

  app.get("/processes/:name/events", { preHandler: requireAuth }, async (request, reply) => {
    const name = parse(processNameSchema, (request.params as { name: string }).name, reply);
    if (!name) return;
    if (!rbac.canViewProcess(request.auth!.eff, name)) return reply.code(403).send({ error: "forbidden" });
    return reply.send({ events: getProcessEvents(db, name, 100) });
  });

  app.get("/processes/:name/crash", { preHandler: requireAuth }, async (request, reply) => {
    const name = parse(processNameSchema, (request.params as { name: string }).name, reply);
    if (!name) return;
    if (!rbac.canViewProcess(request.auth!.eff, name)) return reply.code(403).send({ error: "forbidden" });
    const query = parse(metricsQuerySchema, request.query, reply);
    if (!query) return;
    return reply.send({ analytics: getCrashAnalytics(db, name, query.window) });
  });
}
