import { existsSync, statSync, readFileSync } from "node:fs";
import pc from "picocolors";
import { SERVICE_NAME, configSchema } from "@rekha/shared";
import { paths } from "@rekha/server/paths";
import { pm2, pm2ServiceExists } from "../pm2-admin.js";

function ensureInstalled(): void {
  if (!pm2ServiceExists(SERVICE_NAME)) {
    console.error(pc.red('Rekha is not registered with PM2. Run "rekha install" first.'));
    process.exit(1);
  }
}

export function start(): void {
  ensureInstalled();
  pm2(["start", SERVICE_NAME]);
}

export function stop(): void {
  ensureInstalled();
  pm2(["stop", SERVICE_NAME]);
}

export function restart(): void {
  ensureInstalled();
  pm2(["restart", SERVICE_NAME]);
}

export function status(): void {
  const pths = paths();
  if (!existsSync(pths.config)) {
    console.log(pc.yellow("Rekha is not installed."));
    return;
  }
  const config = configSchema.parse(JSON.parse(readFileSync(pths.config, "utf8")));
  const running = pm2ServiceExists(SERVICE_NAME);
  const dbSize = existsSync(pths.db) ? (statSync(pths.db).size / 1024 / 1024).toFixed(2) : "0";

  console.log(pc.bold("\nRekha status"));
  console.log(`  Service:   ${running ? pc.green("registered") : pc.red("not registered")}`);
  console.log(`  URL:       http://${config.host}:${config.port}`);
  console.log(`  Data dir:  ${pths.home}`);
  console.log(`  DB size:   ${dbSize} MB\n`);
  console.log(pc.dim("For live process details, run: pm2 show rekha\n"));
}
