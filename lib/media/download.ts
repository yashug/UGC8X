const TIMEOUT_MS = 20_000;
const MAX_BYTES = 25_000_000;

/**
 * Best-effort fetch of a remote asset into memory. Returns null instead of
 * throwing: a missing image should cost one scene its visual, never the render.
 *
 * Nothing is written to disk. Images are pulled only to read their dimensions;
 * the browser then loads the original URL itself.
 */
export async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

    return new Uint8Array(buffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
