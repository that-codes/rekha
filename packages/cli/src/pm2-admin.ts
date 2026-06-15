import { execFileSync, spawnSync } from "node:child_process";

/** Thin wrapper around the user's `pm2` CLI for managing the Rekha service. */
export function pm2Available(): boolean {
  const r = spawnSync("pm2", ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

export function pm2(args: string[], opts: { quiet?: boolean } = {}): void {
  execFileSync("pm2", args, {
    stdio: opts.quiet ? "ignore" : "inherit",
  });
}

export function pm2ServiceExists(name: string): boolean {
  const r = spawnSync("pm2", ["jlist"], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return false;
  try {
    const list = JSON.parse(r.stdout) as { name: string }[];
    return list.some((p) => p.name === name);
  } catch {
    return false;
  }
}
