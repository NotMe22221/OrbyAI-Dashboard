import crypto from "crypto";
import { optionalEnv } from "./env";

function parseKey(input: string): Buffer {
  const value = input.trim();
  if (/^[A-Fa-f0-9]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  const maybeBase64 = Buffer.from(value, "base64");
  if (maybeBase64.length === 32) {
    return maybeBase64;
  }

  // Accept passphrase-style values by deriving a stable 32-byte key.
  return crypto.createHash("sha256").update(value).digest();
}

function getKey() {
  const configured = optionalEnv("INTEGRATION_ENCRYPTION_KEY");
  if (configured) {
    return parseKey(configured);
  }

  // Development fallback key so local OAuth/connect flows still function.
  return Buffer.from("7f2d4a9b0e1c3d5f7a9c2b4e6d8f0a1234567890abcdef1234567890abcdef11", "hex");
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



