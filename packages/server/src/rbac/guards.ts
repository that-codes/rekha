import type { FastifyReply, FastifyRequest } from "fastify";
import type { Capability } from "@rekha/shared";

export const SESSION_COOKIE = "rekha_sid";

/**
 * Populates request.auth from the signed session cookie. Runs for every /api
 * request; routes then opt into requireAuth / requireCapability as needed.
 */
export async function populateAuth(request: FastifyRequest): Promise<void> {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return;

  const { sessions, rbac } = request.server.services;
  const session = sessions.validate(unsigned.value);
  if (!session) return;

  const eff = rbac.getEffective(session.userId);
  if (!eff) {
    // User disabled/deleted since session was created — revoke.
    sessions.destroy(session.id);
    return;
  }
  request.auth = {
    sessionId: session.id,
    userId: session.userId,
    csrfSecret: session.csrfSecret,
    eff,
  };
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.auth) {
    reply.code(401).send({ error: "unauthenticated" });
  }
}

export function requireCapability(capability: Capability) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.auth) {
      reply.code(401).send({ error: "unauthenticated" });
      return;
    }
    const { rbac, audit } = request.server.services;
    if (!rbac.has(request.auth.eff, capability)) {
      audit.log({
        actorUserId: request.auth.userId,
        action: `denied:${capability}`,
        ip: request.ip,
        result: "denied",
      });
      reply.code(403).send({ error: "forbidden" });
    }
  };
}

/** Double-submit CSRF check for state-changing requests. */
export async function requireCsrf(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.auth) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }
  const token = request.headers["x-csrf-token"];
  if (typeof token !== "string" || token !== request.auth.csrfSecret) {
    reply.code(403).send({ error: "invalid_csrf_token" });
  }
}
