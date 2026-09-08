import { generateSpeech } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import type { ResolvedKeys } from "./keys";

/**
 * Free lane: Gemini TTS on the same Google key that already powers the chat, so
 * a voiceover costs nothing extra and needs no second signup. ElevenLabs is the
 * upgrade (M4+), mainly because it returns word-level timestamps for karaoke
 * captions. Until then captions are timed from the script we wrote ourselves,
 * which is why they work on any provider.
 */

/**
 * Tried in order, falling through on a quota failure.
 *
 * The free tier meters each TTS model separately and gemini-2.5-flash-preview-tts
 * allows only TEN requests a day — one video is five calls, so two videos killed
 * it and every render after that came out silent. The 3.1 preview draws from its
 * own bucket, so ordering it first and falling back roughly triples what the free
 * lane can speak.
 */
export const VOICE_MODELS = process.env.GOOGLE_TTS_MODEL
  ? [process.env.GOOGLE_TTS_MODEL]
  : ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];

export const VOICE_NAME = process.env.GOOGLE_TTS_VOICE ?? "Kore";

export type Voiceover = {
  /** WAV bytes, ready to hand to Remotion. */
  audio: Uint8Array;
  mediaType: string;
  source: "gemini" | "none";
};

/** No key is a configuration state, not a failure — the caller treats it differently. */
export class NoVoiceKeyError extends Error {
  constructor() {
    super("No key available for text to speech.");
    this.name = "NoVoiceKeyError";
  }
}

/**
 * Throws on a genuine failure rather than returning empty audio.
 *
 * An earlier version swallowed every error and returned silence, so a quota
 * failure produced a completely silent video that nothing in the system reported.
 * A missing voiceover is the single most damaging thing that can go wrong here,
 * so it must be loud.
 */
export async function generateVoiceover(
  keys: ResolvedKeys,
  text: string,
): Promise<Voiceover> {
  const apiKey = keys.keys.google;
  if (!apiKey) throw new NoVoiceKeyError();
  if (!text.trim()) {
    return { audio: new Uint8Array(), mediaType: "", source: "none" };
  }

  const google = createGoogleGenerativeAI({ apiKey });

  let result;
  let lastError: unknown;
  for (const modelId of VOICE_MODELS) {
    try {
      result = await generateSpeech({
        model: google.speech(modelId),
        text,
        voice: VOICE_NAME,
      });
      break;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // Only a quota failure is worth trying another model for.
      if (!/quota|rate.?limit|429/i.test(message)) throw error;
    }
  }

  if (!result) throw lastError ?? new Error("Text to speech failed.");

  const mediaType = result.audio.mediaType ?? "";
  const bytes = result.audio.uint8Array;

  // Gemini TTS hands back raw signed 16-bit PCM. Browsers and ffmpeg both need a
  // container, so give it a WAV header rather than shipping headerless bytes.
  if (isRawPcm(mediaType)) {
    return {
      audio: wrapPcmAsWav(bytes, sampleRateFrom(mediaType)),
      mediaType: "audio/wav",
      source: "gemini",
    };
  }

  return { audio: bytes, mediaType: mediaType || "audio/wav", source: "gemini" };
}

function isRawPcm(mediaType: string): boolean {
  return /l16|pcm/i.test(mediaType);
}

function sampleRateFrom(mediaType: string): number {
  const match = mediaType.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24_000;
}

export function wrapPcmAsWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, pcm.byteLength, true);

  new Uint8Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
}
