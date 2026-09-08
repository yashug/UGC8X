import { describe, expect, it } from "vitest";
import { wavDurationSec } from "@/lib/media/wav";
import { wrapPcmAsWav } from "@/lib/providers/voice";

describe("wavDurationSec", () => {
  it("computes duration from a real header", () => {
    // 24kHz mono 16-bit: 48000 bytes is exactly one second.
    const wav = wrapPcmAsWav(new Uint8Array(48_000), 24_000);
    expect(wavDurationSec(wav)).toBeCloseTo(1, 3);
  });

  it("scales with sample rate", () => {
    const wav = wrapPcmAsWav(new Uint8Array(96_000), 48_000);
    expect(wavDurationSec(wav)).toBeCloseTo(1, 3);
  });

  it("returns 0 for non-wav bytes rather than a wrong number", () => {
    expect(wavDurationSec(new Uint8Array([1, 2, 3]))).toBe(0);
    expect(wavDurationSec(new Uint8Array(100))).toBe(0);
  });
});

describe("wrapPcmAsWav", () => {
  it("writes a header ffmpeg and browsers will accept", () => {
    const wav = wrapPcmAsWav(new Uint8Array(1000), 24_000);
    const tag = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(36)).toBe("data");
    expect(wav.byteLength).toBe(1044);
  });
});
