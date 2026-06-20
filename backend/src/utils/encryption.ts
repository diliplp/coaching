import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    // Warn but fall back to a deterministic key derived from a constant so the
    // app doesn't crash in dev without the env var. In production ENCRYPTION_KEY must be set.
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY env var is required in production (64-char hex = 32 bytes).");
    }
    console.warn("[encryption] ENCRYPTION_KEY not set — using insecure dev key. Set ENCRYPTION_KEY in production.");
    return crypto.createHash("sha256").update("dev-insecure-key").digest();
  }
  return Buffer.from(hex, "hex");
}

/**
 * AES-256-GCM encrypt. Returns "iv:authTag:ciphertext" (all base64).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * AES-256-GCM decrypt. Accepts the format produced by encrypt().
 */
export function decrypt(encryptedText: string): string {
  const key = getKey();
  const parts = encryptedText.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted text format");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}
