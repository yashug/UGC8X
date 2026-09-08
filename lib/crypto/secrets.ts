import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

/**
 * AES-256-GCM for user-supplied provider keys.
 *
 * Encryption happens at the storage boundary rather than in the store itself, so
 * when the in-memory map becomes a Postgres table in M5 nothing about this file
 * or its callers changes — the ciphertext is already the thing being stored.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const configured = process.env.ENCRYPTION_KEY;
  if (configured && configured.length >= 32) {
    // Hashed so any sufficiently long passphrase yields a valid 32-byte key.
    cachedKey = createHash("sha256").update(configured).digest();
    return cachedKey;
  }

  // No key configured: use a per-process random one. Stored secrets then die
  // with the process, which is the safe failure — never a hardcoded default.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[ugc8x] ENCRYPTION_KEY is not set. Saved API keys will not survive a restart.",
    );
  }
  cachedKey = randomBytes(32);
  return cachedKey;
}

export type Sealed = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function seal(plaintext: string): Sealed {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function unseal(sealed: Sealed): string | null {
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(sealed.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key, or tampered ciphertext. Either way there is no secret to return.
    return null;
  }
}
