import { seal, unseal, type Sealed } from "@/lib/crypto/secrets";
import { maskKey, type ProviderKeys, type ProviderName } from "@/lib/providers/keys";

/**
 * Session-scoped store for keys a user brought themselves.
 *
 * It has to live server-side: the render pipeline runs minutes after the request
 * that started it, by which point a key held only in the browser is long gone.
 *
 * The map is per-process and therefore wrong for serverless — M5 replaces it with
 * a Postgres table. Because values are sealed on the way in and opened on the way
 * out, that swap touches this file and nothing else.
 */

type Entry = {
  sealed: Sealed;
  mask: string;
  expiresAt: number;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const sessions = new Map<string, Partial<Record<ProviderName, Entry>>>();

function live(entry: Entry | undefined): Entry | undefined {
  if (!entry) return undefined;
  return entry.expiresAt > Date.now() ? entry : undefined;
}

export function saveKey(sessionId: string, provider: ProviderName, key: string): string {
  const bucket = sessions.get(sessionId) ?? {};
  const mask = maskKey(key);

  bucket[provider] = { sealed: seal(key), mask, expiresAt: Date.now() + TTL_MS };
  sessions.set(sessionId, bucket);
  return mask;
}

export function deleteKey(sessionId: string, provider: ProviderName): void {
  const bucket = sessions.get(sessionId);
  if (!bucket) return;
  delete bucket[provider];
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Masks only — the plaintext never goes back to the browser. */
export function maskedKeys(sessionId: string): Partial<Record<ProviderName, string>> {
  const bucket = sessions.get(sessionId);
  if (!bucket) return {};

  const out: Partial<Record<ProviderName, string>> = {};
  for (const [provider, entry] of Object.entries(bucket)) {
    const current = live(entry);
    if (current) out[provider as ProviderName] = current.mask;
  }
  return out;
}

export function readKeys(sessionId: string): ProviderKeys {
  const bucket = sessions.get(sessionId);
  if (!bucket) return {};

  const out: ProviderKeys = {};
  for (const [provider, entry] of Object.entries(bucket)) {
    const current = live(entry);
    if (!current) continue;
    const value = unseal(current.sealed);
    if (value) out[provider as ProviderName] = value;
  }
  return out;
}
