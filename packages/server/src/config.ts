import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { configSchema, defaultConfig, type RekhaConfig } from "@rekha/shared";
import { paths, rekhaHome } from "./paths.js";
import { readSecrets, type SecretBundle } from "./crypto/keys.js";

export interface LoadedConfig {
  home: string;
  config: RekhaConfig;
  secrets: SecretBundle;
  paths: ReturnType<typeof paths>;
}

export function loadConfig(home = rekhaHome()): LoadedConfig {
  const p = paths(home);
  const config = existsSync(p.config)
    ? configSchema.parse(JSON.parse(readFileSync(p.config, "utf8")))
    : defaultConfig();
  const secrets = readSecrets(p.secretKey);
  return { home, config, secrets, paths: p };
}

export function writeConfig(file: string, config: RekhaConfig): void {
  writeFileSync(file, JSON.stringify(configSchema.parse(config), null, 2), {
    mode: 0o644,
  });
}
