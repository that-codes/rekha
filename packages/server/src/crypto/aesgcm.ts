import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM authenticated encryption for sensitive DB columns (e.g. TOTP
 * secrets). Output format: base64( iv[12] | tag[16] | ciphertext ).
 */
export class ColumnCipher {
  private readonly key: Buffer;

  constructor(dataKeyHex: string) {
    this.key = Buffer.from(dataKeyHex, "hex");
    if (this.key.length !== 32) {
      throw new Error("Data encryption key must be 32 bytes (64 hex chars).");
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString("base64");
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }
}
