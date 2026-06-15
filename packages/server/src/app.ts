import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import Fastify, { type FastifyInstance, type FastifyBaseLogger } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import type { WebSocket } from "ws";
import type { Services } from "./services.js";
import type { WsHub } from "./ws/hub.js";
import { populateAuth } from "./rbac/guards.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { processRoutes } from "./routes/processes.js";
import { metricsRoutes } from "./routes/metrics.js";
import { logRoutes } from "./routes/logs.js";
import { systemRoutes } from "./routes/system.js";

function webDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.REKHA_WEB_DIR,
    path.resolve(here, "web"), // published bundle: dist/server.js + dist/web/
    path.resolve(here, "../../web/dist"), // dev/workspace: packages/server/dist + packages/web/dist
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

export async function buildApp(services: Services, hub: WsHub): Promise<FastifyInstance> {
  const { config, secrets } = services.loaded;
  const app = Fastify({
    // Cast keeps Fastify on its default logger generic while using our pino instance.
    logger: services.log as unknown as FastifyBaseLogger,
    trustProxy: config.trustedProxies.length > 0 ? config.trustedProxies : false,
    bodyLimit: 1 << 20,
  });

  app.decorate("services", services);

  await app.register(cookie, { secret: secrets.sessionSecret });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    // HSTS is set at the TLS-terminating reverse proxy.
    hsts: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
  await app.register(websocket);

  app.get("/healthz", async () => ({ status: "ok", version: services.version }));

  // ---- API ----
  await app.register(
    async (api) => {
      api.addHook("preHandler", populateAuth);
      await api.register(authRoutes, { prefix: "/auth" });
      await api.register(userRoutes);
      await api.register(processRoutes);
      await api.register(metricsRoutes);
      await api.register(logRoutes);
      await api.register(systemRoutes);
    },
    { prefix: "/api/v1" },
  );

  // ---- WebSocket ----
  await app.register(async (w) => {
    w.addHook("preHandler", populateAuth);
    w.get("/ws", { websocket: true }, (socket: WebSocket, req) => {
      // CSWSH protection: reject cross-origin upgrades.
      const origin = req.headers.origin;
      const host = req.headers["x-forwarded-host"] ?? req.headers.host;
      if (origin && host && !originMatchesHost(origin, String(host))) {
        socket.close(1008, "bad_origin");
        return;
      }
      if (!req.auth) {
        socket.close(1008, "unauthenticated");
        return;
      }
      hub.register(socket, req.auth.userId);
    });
  });

  // ---- Static SPA + fallback ----
  const dir = webDir();
  if (dir) {
    await app.register(fastifyStatic, { root: dir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/ws")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }

  return app;
}

function originMatchesHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
