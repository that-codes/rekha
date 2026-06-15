import os from "node:os";
import path from "node:path";

/**
 * Resolves Rekha's runtime data directory. Defaults to ~/.rekha but can be
 * overridden with REKHA_HOME (useful for tests and multi-instance hosts).
 */
export function rekhaHome(): string {
  return process.env.REKHA_HOME
    ? path.resolve(process.env.REKHA_HOME)
    : path.join(os.homedir(), ".rekha");
}

export function paths(home = rekhaHome()) {
  return {
    home,
    config: path.join(home, "config.json"),
    secretKey: path.join(home, "secret.key"),
    db: path.join(home, "rekha.db"),
    ecosystem: path.join(home, "ecosystem.config.cjs"),
    backups: path.join(home, "backups"),
  };
}

export type RekhaPaths = ReturnType<typeof paths>;
