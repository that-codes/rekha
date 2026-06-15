import "fastify";
import type { Services } from "./services.js";
import type { EffectivePermissions } from "./rbac/service.js";

declare module "fastify" {
  interface FastifyInstance {
    services: Services;
  }
  interface FastifyRequest {
    /** Set by the auth preHandler for authenticated /api requests. */
    auth?: {
      sessionId: string;
      userId: number;
      csrfSecret: string;
      eff: EffectivePermissions;
    };
  }
}
