/**
 * Reads a WAV header well enough to get its duration.
 *
 * This matters more than it looks: the model *guesses* how long each line takes
 * to say, and it is routinely wrong by a second or more. Timing scenes off the
 * real audio is the difference between a video that works and one that cuts the
 * voiceover off mid-word.
 */
export function wavDurationSec(bytes: Uint8Array): number {
  if (bytes.byteLength < 44) return 0;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));

  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return 0;

  let byteRate = 0;
  let offset = 12;

  // Chunks are not in a guaranteed order, so walk them rather than assuming.
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === "fmt " && body + 16 <= bytes.byteLength) {
      byteRate = view.getUint32(body + 8, true);
    }

    if (id === "data") {
      const dataSize = Math.min(size, bytes.byteLength - body);
      return byteRate > 0 ? dataSize / byteRate : 0;
    }

    offset = body + size + (size % 2); // chunks are word-aligned
  }

  return 0;
}
