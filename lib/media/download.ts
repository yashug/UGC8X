import { writeFile } from "node:fs/promises";

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 25_000_000;

/**
 * Best-effort fetch of a remote asset to disk. Returns null instead of throwing:
 * a missing image should cost us one scene's visual, never the whole render.
 */
export async function downloadTo(
  url: string,
  destination: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

    await writeFile(destination, Buffer.from(buffer));
    return destination;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
