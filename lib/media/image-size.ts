/**
 * Reads pixel dimensions straight out of an image header.
 *
 * The pipeline needs this to decide how to present a picture: a portrait app
 * screenshot belongs in a phone frame, while a landscape og:image put in that
 * same frame gets its headline cropped off the sides. Guessing produced exactly
 * that bug, so the aspect ratio is measured instead.
 */
export type ImageSize = { width: number; height: number };

export function readImageSize(bytes: Uint8Array): ImageSize | null {
  return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes) ?? readGif(bytes);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readPng(bytes: Uint8Array): ImageSize | null {
  if (bytes.byteLength < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) return null;

  const data = view(bytes);
  return { width: data.getUint32(16), height: data.getUint32(20) };
}

function readJpeg(bytes: Uint8Array): ImageSize | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const data = view(bytes);
  let offset = 2;

  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset++; // resync past padding
      continue;
    }
    const marker = bytes[offset + 1];
    const length = data.getUint16(offset + 2);

    // SOF0-SOF15, excluding the non-frame markers in that range.
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isFrame) {
      return {
        height: data.getUint16(offset + 5),
        width: data.getUint16(offset + 7),
      };
    }

    if (length < 2) return null;
    offset += 2 + length;
  }

  return null;
}

function readWebp(bytes: Uint8Array): ImageSize | null {
  if (bytes.byteLength < 30) return null;
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;

  const format = tag(12);
  const data = view(bytes);

  if (format === "VP8X") {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }

  if (format === "VP8 ") {
    return {
      width: data.getUint16(26, true) & 0x3fff,
      height: data.getUint16(28, true) & 0x3fff,
    };
  }

  if (format === "VP8L") {
    const bits = data.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

function readGif(bytes: Uint8Array): ImageSize | null {
  if (bytes.byteLength < 10) return null;
  const tag = String.fromCharCode(...bytes.subarray(0, 3));
  if (tag !== "GIF") return null;

  const data = view(bytes);
  return { width: data.getUint16(6, true), height: data.getUint16(8, true) };
}
