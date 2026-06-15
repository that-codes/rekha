import { existsSync, mkdirSync } from "node:fs";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { configSchema, defaultConfig, passwordSchema, emailSchema, SERVICE_NAME } from "@rekha/shared";
import { paths, rekhaHome } from "@rekha/server/paths";
import { generateSecrets, writeSecrets } from "@rekha/server/crypto/keys";
import { writeConfig } from "@rekha/server/config";
import { openDatabase } from "@rekha/server/db/client";
import { seedRoles, createAdmin } from "@rekha/server/db/seed";
import { pm2, pm2Available, pm2ServiceExists } from "../pm2-admin.js";
import { writeEcosystem } from "../ecosystem.js";
import { isPortFree, nodeMajor } from "../util.js";

export async function install(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" Rekha installer ")));

  // ---- Preflight ----
  if (nodeMajor() < 20) {
    p.cancel("Rekha requires Node.js 20 or newer.");
    process.exit(1);
  }
  if (!pm2Available()) {
    p.cancel("PM2 was not found on PATH. Install it first: npm install -g pm2");
    process.exit(1);
  }

  const home = rekhaHome();
  const pths = paths(home);
  if (existsSync(pths.config)) {
    const proceed = await p.confirm({
      message: `An existing install was found at ${home}. Reconfigure it? (database is preserved)`,
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.cancel("Aborted.");
      process.exit(0);
    }
  }

  // ---- Prompts ----
  const email = await p.text({
    message: "Admin email",
    placeholder: "admin@example.com",
    validate: (v) => (emailSchema.safeParse(v).success ? undefined : "Enter a valid email address"),
  });
  if (p.isCancel(email)) return cancel();

  const password = await p.password({
    message: "Admin password (min 12 chars, mixed case + digit)",
    validate: (v) => (passwordSchema.safeParse(v).success ? undefined : "Does not meet strength requirements"),
  });
  if (p.isCancel(password)) return cancel();

  const confirmPw = await p.password({ message: "Confirm password" });
  if (p.isCancel(confirmPw)) return cancel();
  if (confirmPw !== password) {
    p.cancel("Passwords did not match.");
    process.exit(1);
  }

  const portStr = await p.text({
    message: "Port for the Rekha dashboard",
    initialValue: "9700",
    validate: (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n > 0 && n < 65536 ? undefined : "Enter a valid port (1-65535)";
    },
  });
  if (p.isCancel(portStr)) return cancel();
  const port = Number(portStr);

  const host = "127.0.0.1";
  if (!(await isPortFree(host, port))) {
    p.cancel(`Port ${port} on ${host} is already in use. Choose another port.`);
    process.exit(1);
  }

  // ---- Provision ----
  const s = p.spinner();
  s.start("Provisioning Rekha");

  mkdirSync(home, { recursive: true, mode: 0o700 });
  mkdirSync(pths.backups, { recursive: true, mode: 0o700 });

  if (!existsSync(pths.secretKey)) {
    writeSecrets(pths.secretKey, generateSecrets());
  }

  const config = configSchema.parse({ ...defaultConfig(), host, port });
  writeConfig(pths.config, config);

  const db = openDatabase(pths.db);
  seedRoles(db);
  try {
    await createAdmin(db, emailSchema.parse(email), password);
  } catch {
    s.stop("Admin account already exists — keeping the existing one.");
  }
  db.close();

  writeEcosystem(pths.ecosystem, home);
  s.stop("Files created");

  // ---- Register with PM2 ----
  const s2 = p.spinner();
  s2.start("Registering Rekha with PM2");
  if (pm2ServiceExists(SERVICE_NAME)) {
    pm2(["restart", SERVICE_NAME], { quiet: true });
  } else {
    pm2(["start", pths.ecosystem], { quiet: true });
  }
  pm2(["save"], { quiet: true });
  s2.stop("Rekha is running under PM2");

  p.note(
    [
      `Dashboard:   ${pc.cyan(`http://${host}:${port}`)}`,
      `Data dir:    ${home}`,
      "",
      pc.dim("Next steps:"),
      pc.dim("  • Put a TLS reverse proxy (Nginx/Caddy/Traefik) in front of the port above."),
      pc.dim("  • Run `pm2 startup` once so Rekha survives reboots."),
    ].join("\n"),
    "Installed",
  );
  p.outro(pc.green("Rekha installed successfully."));
}

function cancel(): never {
  p.cancel("Installation cancelled.");
  process.exit(0);
}
