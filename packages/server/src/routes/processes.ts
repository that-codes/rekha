import type { FastifyInstance } from "fastify";
import {
  Capabilities,
  bulkActionSchema,
  processAccessSchema,
  processActionSchema,
  processNameSchema,
  type ProcessAction,
} from "@rekha/shared";
import { requireAuth, requireCapability, requireCsrf } from "../rbac/guards.js";
import { parse, clientIp } from "./util.js";
import { listProcessAccess, setProcessAccess } from "../db/permissions.js";
import { getUserById } from "../db/users.js";
import type { LifecycleAction } from "../pm2/provider.js";

export async function processRoutes(app: FastifyInstance): Promise<void> {
  const { provider, rbac, audit, db } = app.services;

  app.get("/processes", { preHandler: requireAuth }, async (request, reply) => {
    const eff = request.auth!.eff;
    const all = await provider.list();
    const visible = all.filter((p) => rbac.canViewProcess(eff, p.name));

    if (rbac.isAdmin(eff)) {
      const assignedNames = new Set(
        (db.prepare("SELECT DISTINCT process_name FROM process_permissions").all() as {
          process_name: string;
        }[]).map((r) => r.process_name),
      );
      for (const p of visible) p.assigned = assignedNames.has(p.name);
    }
    return reply.send({ processes: visible });
  });

  app.get("/processes/:name", { preHandler: requireAuth }, async (request, reply) => {
    const name = parse(processNameSchema, (request.params as { name: string }).name, reply);
    if (!name) return;
    if (!rbac.canViewProcess(request.auth!.eff, name)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const desc = await provider.describe(name);
    if (!desc) return reply.code(404).send({ error: "not_found" });
    return reply.send({ process: desc.info });
  });

  app.post(
    "/processes/:name/:action",
    { preHandler: [requireAuth, requireCsrf] },
    async (request, reply) => {
      const params = request.params as { name: string; action: string };
      const name = parse(processNameSchema, params.name, reply);
      if (!name) return;
      const action = parse(processActionSchema, params.action, reply);
      if (!action) return;

      if (!rbac.canDoProcessAction(request.auth!.eff, name, action as ProcessAction)) {
        audit.log({ actorUserId: request.auth!.userId, action: `process_${action}`, targetType: "process", targetId: name, ip: clientIp(request), result: "denied" });
        return reply.code(403).send({ error: "forbidden" });
      }
      // Confirm the process actually exists before issuing the command.
      const desc = await provider.describe(name);
      if (!desc) return reply.code(404).send({ error: "not_found" });

      try {
        await provider.act(name, action as LifecycleAction);
        audit.log({ actorUserId: request.auth!.userId, action: `process_${action}`, targetType: "process", targetId: name, ip: clientIp(request), result: "ok" });
        return reply.send({ ok: true });
      } catch (err) {
        audit.log({ actorUserId: request.auth!.userId, action: `process_${action}`, targetType: "process", targetId: name, ip: clientIp(request), result: "fail", detail: { message: String(err) } });
        return reply.code(500).send({ error: "action_failed", message: String(err) });
      }
    },
  );

  app.post(
    "/processes/bulk",
    { preHandler: [requireAuth, requireCsrf] },
    async (request, reply) => {
      const body = parse(bulkActionSchema, request.body, reply);
      if (!body) return;
      const eff = request.auth!.eff;
      const results: { name: string; ok: boolean; error?: string }[] = [];

      for (const name of body.names) {
        if (!rbac.canDoProcessAction(eff, name, body.action as ProcessAction)) {
          results.push({ name, ok: false, error: "forbidden" });
          audit.log({ actorUserId: request.auth!.userId, action: `process_${body.action}`, targetType: "process", targetId: name, ip: clientIp(request), result: "denied" });
          continue;
        }
        try {
          await provider.act(name, body.action as LifecycleAction);
          results.push({ name, ok: true });
          audit.log({ actorUserId: request.auth!.userId, action: `process_${body.action}`, targetType: "process", targetId: name, ip: clientIp(request), result: "ok" });
        } catch (err) {
          results.push({ name, ok: false, error: String(err) });
          audit.log({ actorUserId: request.auth!.userId, action: `process_${body.action}`, targetType: "process", targetId: name, ip: clientIp(request), result: "fail" });
        }
      }
      return reply.send({ results });
    },
  );

  // ---- Per-process user access (admin only) ----
  const adminOnly = { preHandler: [requireAuth, requireCapability(Capabilities.MANAGE_USERS)] };
  const adminMutate = {
    preHandler: [requireAuth, requireCapability(Capabilities.MANAGE_USERS), requireCsrf],
  };

  app.get("/processes/:name/access", adminOnly, async (request, reply) => {
    const name = parse(processNameSchema, (request.params as { name: string }).name, reply);
    if (!name) return;
    return reply.send({ access: listProcessAccess(db, name) });
  });

  app.put("/processes/:name/access", adminMutate, async (request, reply) => {
    const name = parse(processNameSchema, (request.params as { name: string }).name, reply);
    if (!name) return;
    const body = parse(processAccessSchema, request.body, reply);
    if (!body) return;
    if (!getUserById(db, body.userId)) return reply.code(404).send({ error: "user_not_found" });

    setProcessAccess(db, body.userId, name, body.actions, request.auth!.userId);
    rbac.invalidate(body.userId);
    audit.log({
      actorUserId: request.auth!.userId,
      action: body.actions.length ? "process_access_grant" : "process_access_revoke",
      targetType: "process",
      targetId: name,
      ip: clientIp(request),
      result: "ok",
      detail: { userId: body.userId, actions: body.actions },
    });
    return reply.send({ access: listProcessAccess(db, name) });
  });
}
