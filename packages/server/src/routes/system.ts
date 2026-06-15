import type { FastifyInstance } from "fastify";
import { Capabilities, auditQuerySchema } from "@rekha/shared";
import { requireAuth, requireCapability } from "../rbac/guards.js";
import { parse } from "./util.js";
import { buildHostInfo } from "../analytics/host.js";

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  const { collector, audit, version } = app.services;

  app.get("/healthz", async () => ({ status: "ok", version }));

  app.get("/system/info", { preHandler: requireAuth }, async () =>
    buildHostInfo(version),
  );

  app.get(
    "/system/overview",
    { preHandler: [requireAuth, requireCapability(Capabilities.VIEW_DASHBOARD)] },
    async (_request, reply) => {
      const snap = collector.snapshot();
      return reply.send({ overview: snap.overview });
    },
  );

  app.get(
    "/audit",
    { preHandler: [requireAuth, requireCapability(Capabilities.VIEW_AUDIT)] },
    async (request, reply) => {
      const query = parse(auditQuerySchema, request.query, reply);
      if (!query) return;
      return reply.send({ entries: audit.query(query) });
    },
  );
}
