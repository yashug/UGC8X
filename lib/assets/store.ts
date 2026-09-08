/**
 * Ephemeral, in-memory audio.
 *
 * Nothing about a video is stored any more: the browser assembles it live from a
 * Remotion Player. Images and the hook clip are played straight from their
 * original URLs, so the only thing the server has to hold is the voiceover it
 * generated — and that lives in memory, is served once, and expires.
 *
 * Per-process, so it is wrong for multi-instance serverless in the same way the
 * job store is. Both are M5's problem, and both are deliberately tiny.
 */

type Entry = {
  bytes: Uint8Array;
  contentType: string;
  expiresAt: number;
};

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 200;

const assets = new Map<string, Entry>();

function key(jobId: string, name: string): string {
  return `${jobId}/${name}`;
}

function evictExpired(): void {
  const now = Date.now();
  for (const [id, entry] of assets) {
    if (entry.expiresAt <= now) assets.delete(id);
  }
  while (assets.size > MAX_ENTRIES) {
    const oldest = assets.keys().next().value;
    if (!oldest) break;
    assets.delete(oldest);
  }
}

export function putAsset(
  jobId: string,
  name: string,
  bytes: Uint8Array,
  contentType: string,
): string {
  evictExpired();
  assets.set(key(jobId, name), {
    bytes,
    contentType,
    expiresAt: Date.now() + TTL_MS,
  });
  // The URL the Player will fetch. Same-origin, so no CORS to negotiate.
  return `/api/assets/${jobId}/${name}`;
}

export function getAsset(jobId: string, name: string): Entry | undefined {
  const entry = assets.get(key(jobId, name));
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    assets.delete(key(jobId, name));
    return undefined;
  }
  return entry;
}
