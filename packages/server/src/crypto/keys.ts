import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";

export interface SecretBundle {
  /** HMAC key used to sign session cookies. */
  sessionSecret: string;
  /** 32-byte hex data-encryption key (DEK) for AES-256-GCM column encryption. */
  dataKeyHex: string;
  /** Schema version of the secret file, for future rotation. */
  version: number;
}

/** Generates a fresh secret bundle (used by `rekha install`). */
export function generateSecrets(): SecretBundle {
  return {
    sessionSecret: randomBytes(48).toString("base64url"),
    dataKeyHex: randomBytes(32).toString("hex"),
    version: 1,
  };
}

/** Persists secrets with strict 0600 permissions. */
export function writeSecrets(file: string, secrets: SecretBundle): void {
  writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function readSecrets(file: string): SecretBundle {
  if (!existsSync(file)) {
    throw new Error(
      `Secret key file not found at ${file}. Run "rekha install" first.`,
    );
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as SecretBundle;
  if (!parsed.sessionSecret || !parsed.dataKeyHex) {
    throw new Error("Secret key file is corrupt or incomplete.");
  }
  return parsed;
}
