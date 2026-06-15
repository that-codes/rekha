import type { FastifyInstance, FastifyReply } from "fastify";
import {
  loginSchema,
  changePasswordSchema,
} from "@rekha/shared";
import { SESSION_COOKIE, requireAuth, requireCsrf } from "../rbac/guards.js";
import { parse, clientIp, userAgent } from "./util.js";
import { getUserById, getUserByEmail, toSafeUser, setPasswordHash } from "../db/users.js";
import { getGrants } from "../db/permissions.js";
import { verifyPassword, hashPassword } from "../auth/password.js";

function cookieOpts() {
  const secure = process.env.REKHA_INSECURE_COOKIE !== "1";
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    signed: true,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, sessions, bruteForce, rbac, audit } = app.services;

  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = parse(loginSchema, request.body, reply);
      if (!body) return;

      const ip = clientIp(request);
      const ua = userAgent(request);
      const fail = (msg = "invalid_credentials") => {
        audit.log({ action: "login", actorUsername: body.email, ip, userAgent: ua, result: "fail" });
        return reply.code(401).send({ error: msg });
      };

      const user = getUserByEmail(db, body.email);
      if (!user) {
        // Mitigate user enumeration via timing.
        await hashPassword(body.password).catch(() => undefined);
        return fail();
      }
      if (user.status === "disabled") return fail("account_disabled");

      const lock = bruteForce.check(user.id);
      if (lock.locked) {
        audit.log({ actorUserId: user.id, action: "login", actorUsername: user.email, ip, userAgent: ua, result: "denied", detail: { reason: "locked" } });
        return reply.code(429).send({ error: "account_locked", lockedUntil: lock.lockedUntil });
      }

      const ok = await verifyPassword(user.password_hash, body.password);
      if (!ok) {
        bruteForce.recordFailure(user.id);
        return fail();
      }

      bruteForce.recordSuccess(user.id);
      const session = sessions.create(user.id, ip, ua);
      reply.setCookie(SESSION_COOKIE, session.id, cookieOpts());
      audit.log({ actorUserId: user.id, action: "login", actorUsername: user.email, ip, userAgent: ua, result: "ok" });

      return reply.send({
        user: toSafeUser(db, user),
        csrfToken: session.csrfSecret,
      });
    },
  );

  app.post("/logout", { preHandler: [requireAuth, requireCsrf] }, async (request, reply) => {
    sessions.destroy(request.auth!.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    audit.log({ actorUserId: request.auth!.userId, action: "logout", ip: clientIp(request), result: "ok" });
    return reply.send({ ok: true });
  });

  app.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    const user = getUserById(db, request.auth!.userId);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    return reply.send({
      user: toSafeUser(db, user),
      grants: getGrants(db, user.id),
      csrfToken: request.auth!.csrfSecret,
    });
  });

  app.post(
    "/change-password",
    { preHandler: [requireAuth, requireCsrf] },
    async (request, reply) => {
      const body = parse(changePasswordSchema, request.body, reply);
      if (!body) return;
      const user = getUserById(db, request.auth!.userId);
      if (!user) return reply.code(401).send({ error: "unauthenticated" });

      const ok = await verifyPassword(user.password_hash, body.currentPassword);
      if (!ok) {
        audit.log({ actorUserId: user.id, action: "change_password", ip: clientIp(request), result: "fail" });
        return reply.code(400).send({ error: "wrong_current_password" });
      }
      setPasswordHash(db, user.id, await hashPassword(body.newPassword));
      // Invalidate all other sessions on credential change.
      sessions.destroyAllForUser(user.id);
      audit.log({ actorUserId: user.id, action: "change_password", ip: clientIp(request), result: "ok" });
      return reply.send({ ok: true });
    },
  );
}

export type { FastifyReply };
