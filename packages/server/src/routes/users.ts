import type { FastifyInstance } from "fastify";
import {
  Capabilities,
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  setPermissionsSchema,
} from "@rekha/shared";
import { requireAuth, requireCapability, requireCsrf } from "../rbac/guards.js";
import { parse, clientIp } from "./util.js";
import {
  listUsers,
  createUser,
  getRoleByName,
  getUserById,
  toSafeUser,
  updateUser,
  deleteUser,
  setPasswordHash,
  listRoles,
  countAdmins,
} from "../db/users.js";
import { getGrants, setGrants } from "../db/permissions.js";
import { hashPassword } from "../auth/password.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const { db, rbac, audit, sessions } = app.services;
  const adminOnly = { preHandler: [requireAuth, requireCapability(Capabilities.MANAGE_USERS)] };
  const adminMutate = {
    preHandler: [requireAuth, requireCapability(Capabilities.MANAGE_USERS), requireCsrf],
  };

  app.get("/roles", adminOnly, async () => ({ roles: listRoles(db) }));

  app.get("/users", adminOnly, async () => ({ users: listUsers(db) }));

  app.post("/users", adminMutate, async (request, reply) => {
    const body = parse(createUserSchema, request.body, reply);
    if (!body) return;
    const role = getRoleByName(db, body.role);
    if (!role) return reply.code(400).send({ error: "unknown_role" });
    try {
      const id = createUser(db, body.email, await hashPassword(body.password), role.id);
      audit.log({ actorUserId: request.auth!.userId, action: "user_create", targetType: "user", targetId: String(id), ip: clientIp(request), result: "ok", detail: { email: body.email, role: body.role } });
      return reply.code(201).send({ user: toSafeUser(db, getUserById(db, id)!) });
    } catch {
      return reply.code(409).send({ error: "email_taken" });
    }
  });

  app.patch("/users/:id", adminMutate, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const target = getUserById(db, id);
    if (!target) return reply.code(404).send({ error: "not_found" });
    const body = parse(updateUserSchema, request.body, reply);
    if (!body) return;

    let roleId: number | undefined;
    if (body.role) {
      const role = getRoleByName(db, body.role);
      if (!role) return reply.code(400).send({ error: "unknown_role" });
      roleId = role.id;
    }
    // Guard against demoting/disabling the last active admin.
    if ((body.status === "disabled" || (body.role && body.role !== "admin")) && countAdmins(db) <= 1) {
      const tRole = db.prepare("SELECT name FROM roles WHERE id = ?").get(target.role_id) as { name: string };
      if (tRole.name === "admin") return reply.code(400).send({ error: "cannot_remove_last_admin" });
    }

    updateUser(db, id, { roleId, status: body.status });
    rbac.invalidate(id);
    if (body.status === "disabled") sessions.destroyAllForUser(id);
    audit.log({ actorUserId: request.auth!.userId, action: "user_update", targetType: "user", targetId: String(id), ip: clientIp(request), result: "ok", detail: body });
    return reply.send({ user: toSafeUser(db, getUserById(db, id)!) });
  });

  app.delete("/users/:id", adminMutate, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (id === request.auth!.userId) return reply.code(400).send({ error: "cannot_delete_self" });
    const target = getUserById(db, id);
    if (!target) return reply.code(404).send({ error: "not_found" });
    const tRole = db.prepare("SELECT name FROM roles WHERE id = ?").get(target.role_id) as { name: string };
    if (tRole.name === "admin" && countAdmins(db) <= 1) {
      return reply.code(400).send({ error: "cannot_remove_last_admin" });
    }
    deleteUser(db, id);
    rbac.invalidate(id);
    sessions.destroyAllForUser(id);
    audit.log({ actorUserId: request.auth!.userId, action: "user_delete", targetType: "user", targetId: String(id), ip: clientIp(request), result: "ok" });
    return reply.send({ ok: true });
  });

  app.post("/users/:id/reset-password", adminMutate, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!getUserById(db, id)) return reply.code(404).send({ error: "not_found" });
    const body = parse(resetPasswordSchema, request.body, reply);
    if (!body) return;
    setPasswordHash(db, id, await hashPassword(body.newPassword));
    sessions.destroyAllForUser(id);
    audit.log({ actorUserId: request.auth!.userId, action: "user_reset_password", targetType: "user", targetId: String(id), ip: clientIp(request), result: "ok" });
    return reply.send({ ok: true });
  });

  app.get("/users/:id/permissions", adminOnly, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!getUserById(db, id)) return reply.code(404).send({ error: "not_found" });
    return reply.send({ grants: getGrants(db, id) });
  });

  app.put("/users/:id/permissions", adminMutate, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!getUserById(db, id)) return reply.code(404).send({ error: "not_found" });
    const body = parse(setPermissionsSchema, request.body, reply);
    if (!body) return;
    setGrants(db, id, request.auth!.userId, body.grants);
    rbac.invalidate(id);
    audit.log({ actorUserId: request.auth!.userId, action: "permissions_set", targetType: "user", targetId: String(id), ip: clientIp(request), result: "ok", detail: { count: body.grants.length } });
    return reply.send({ grants: getGrants(db, id) });
  });
}
