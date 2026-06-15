import { loadConfig } from "./config.js";
import { buildServices } from "./services.js";
import { buildApp } from "./app.js";
import { WsHub } from "./ws/hub.js";

async function main(): Promise<void> {
  const loaded = loadConfig();
  const services = buildServices(loaded);
  const { log } = services;

  // Connect to PM2's event bus for live events + logs (best effort).
  try {
    await services.provider.startEventStream();
  } catch (err) {
    log.warn({ err }, "PM2 event bus unavailable — falling back to polling only");
  }

  services.collector.start();
  const hub = new WsHub(services);
  hub.start();

  const app = await buildApp(services, hub);
  await app.listen({ host: loaded.config.host, port: loaded.config.port });
  log.info(
    `Rekha v${services.version} listening on http://${loaded.config.host}:${loaded.config.port}`,
  );

  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down...`);
    try {
      hub.stop();
      services.collector.stop();
      await app.close();
      services.provider.dispose();
      services.db.close();
    } catch (err) {
      log.error({ err }, "error during shutdown");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal: failed to start Rekha server", err);
  process.exit(1);
});
