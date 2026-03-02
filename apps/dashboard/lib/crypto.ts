import crypto from "crypto";
import { getEnv } from "./env";

function parseKey(input: string): Buffer {
  if (/^[A-Fa-f0-9]{64}$/.test(input)) {
    return Buffer.from(input, "hex");
  }

  const maybeBase64 = Buffer.from(input, "base64");
  if (maybeBase64.length === 32) {
    return maybeBase64;
  }

  throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes (base64) or be 64 hex chars.");
}

function getKey() {
  return parseKey(getEnv("INTEGRATION_ENCRYPTION_KEY"));
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}



