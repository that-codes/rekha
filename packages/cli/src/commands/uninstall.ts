import { rmSync, existsSync } from "node:fs";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { SERVICE_NAME } from "@rekha/shared";
import { paths } from "@rekha/server/paths";
import { pm2, pm2ServiceExists } from "../pm2-admin.js";

export async function uninstall(): Promise<void> {
  p.intro(pc.bgRed(pc.white(" Rekha uninstall ")));

  const confirm = await p.confirm({
    message: "Stop and remove the Rekha PM2 service?",
    initialValue: false,
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Aborted.");
    process.exit(0);
  }

  // The CLI (not the service) removes the app, so Rekha never kills itself mid-op.
  if (pm2ServiceExists(SERVICE_NAME)) {
    pm2(["delete", SERVICE_NAME], { quiet: true });
    pm2(["save"], { quiet: true });
  }

  const pths = paths();
  const removeData = await p.confirm({
    message: `Also delete all data at ${pths.home} (database, credentials, backups)?`,
    initialValue: false,
  });
  if (!p.isCancel(removeData) && removeData && existsSync(pths.home)) {
    rmSync(pths.home, { recursive: true, force: true });
    p.note(`Removed ${pths.home}`, "Data deleted");
  } else {
    p.note(`Kept data at ${pths.home}`, "Data preserved");
  }

  p.outro(pc.green("Rekha uninstalled."));
}
