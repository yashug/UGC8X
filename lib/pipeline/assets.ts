import type { ProductBrief, VideoScript } from "@/lib/ai/types";
import { fetchBytes } from "@/lib/media/download";
import { readImageSize } from "@/lib/media/image-size";
import { wavDurationSec } from "@/lib/media/wav";
import type { SiteExtract } from "@/lib/product/extract";
import { fetchHookClip } from "@/lib/providers/hook";
import type { ResolvedKeys } from "@/lib/providers/keys";
import { NoVoiceKeyError, generateVoiceover, type Voiceover } from "@/lib/providers/voice";

/** What the Player needs. Every field is a URL the browser can fetch directly. */
export type SceneAsset = {
  index: number;
  durationSec: number;
  voiceover: string;
  onScreenText: string;
  /** Same-origin URL for the generated voiceover, or null if this scene is silent. */
  audioFile: string | null;
  imageFile: string | null;
  videoFile: string | null;
  /**
   * How the image should be presented. A portrait screenshot belongs in a phone
   * frame; a landscape og:image put in one loses its headline off the sides.
   */
  imageFit: "phone" | "wide" | null;
};

export type VideoAssets = {
  productName: string;
  cta: string;
  accentColor: string;
  scenes: SceneAsset[];
  totalDurationSec: number;
  credit?: string;
  /** What we could not get, so the UI can say so rather than quietly degrading. */
  missing: string[];
  /** Voiceover is the asset whose absence ruins the video, so it is reported exactly. */
  voice: { spoken: number; total: number; reason?: string };
};

const SPEECH_CONCURRENCY = 2;
const MIN_SCENE_SEC = 2.5;
const MAX_SCENE_SEC = 10;
const TAIL_PADDING_SEC = 0.45;

/** Page images that are plainly not product shots. */
const NOT_A_SCREENSHOT =
  /logo|icon|avatar|badge|favicon|flag|star|arrow|sprite|headshot|portrait|team|founder|press/i;

/**
 * Only images that look like the product get used.
 *
 * The first pass took anything, and put a stock photo of a man at a harbour on
 * screen under the words "100k+ 5-star ratings". A designed text card is far
 * better than a confidently wrong photograph, so the bar to be shown is high and
 * anything below it falls through to type.
 */
export function pickProductImages(site: SiteExtract, limit = 4): string[] {
  const ranked = site.images
    .filter((image) => !NOT_A_SCREENSHOT.test(image.url) && !NOT_A_SCREENSHOT.test(image.alt))
    .map((image) => ({ image, points: score(image) }))
    .filter((entry) => entry.points >= 3)
    .sort((a, b) => b.points - a.points)
    .map((entry) => entry.image.url);

  const withHero = site.ogImage ? [site.ogImage, ...ranked] : ranked;
  return Array.from(new Set(withHero)).slice(0, limit);
}

export function score(image: { url: string; alt: string }): number {
  const haystack = `${image.url} ${image.alt}`.toLowerCase();
  let points = 0;
  if (/screenshot|screen|mockup|preview|\bui\b|interface/.test(haystack)) points += 4;
  if (/\bapp\b|phone|mobile|dashboard/.test(haystack)) points += 2;
  if (/hero|product|feature/.test(haystack)) points += 1;
  if (/stock|unsplash|pexels|getty|people|person|man|woman|smiling/.test(haystack)) points -= 4;
  return points;
}

/**
 * Turns voiceover coverage into something the user reads on the card.
 * A silent video must never ship without saying so.
 */
export function voiceWarnings(voice: {
  spoken: number;
  total: number;
  reason?: string;
}): string[] {
  if (voice.total === 0 || voice.spoken === voice.total) return [];

  const because = voice.reason ? ` — ${voice.reason}` : "";

  if (voice.spoken === 0) {
    return [`This video has no voiceover${because}.`];
  }
  const silent = voice.total - voice.spoken;
  return [
    `${silent} of ${voice.total} scene${silent === 1 ? " is" : "s are"} silent${because}.`,
  ];
}

type SpeechOutcome = {
  voice: Voiceover | null;
  reason?: string;
  /** True when retrying other scenes cannot help — an exhausted quota or no key. */
  terminal?: boolean;
};

/**
 * Two attempts, with a pause between them, because the common failure is a
 * per-minute rate limit that clears on its own. Anything still failing after
 * that is reported rather than swallowed.
 */
async function speakWithRetry(
  keys: ResolvedKeys,
  text: string,
  attempts = 2,
): Promise<SpeechOutcome> {
  let reason: string | undefined;
  let terminal = false;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return { voice: await generateVoiceover(keys, text) };
    } catch (error) {
      if (error instanceof NoVoiceKeyError) {
        return { voice: null, reason: "no key for text to speech", terminal: true };
      }
      const message = error instanceof Error ? error.message : String(error);
      const quota = /quota|rate.?limit|429/i.test(message);
      reason = quota
        ? "the text-to-speech quota is exhausted"
        : "text to speech failed";
      if (quota) terminal = true;

      // Never silent: a swallowed error here is what shipped a silent video.
      console.warn(`[ugc8x] voiceover attempt ${attempt + 1} failed: ${message.slice(0, 160)}`);

      // Every TTS model already refused on quota grounds; waiting will not help.
      if (terminal) break;

      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
  }

  return { voice: null, reason, terminal };
}

export async function buildAssets({
  keys,
  brief,
  script,
  site,
}: {
  keys: ResolvedKeys;
  brief: ProductBrief;
  script: VideoScript;
  site: SiteExtract;
}): Promise<VideoAssets> {
  const missing: string[] = [];

  // The hook clip is independent of speech, so it can run alongside.
  const hookPromise = fetchHookClip(keys, brief).catch(() => null);

  // Two at a time. Five at once reliably tripped the per-minute rate limit and
  // turned scenes silent; one at a time was reliable but slow enough to threaten
  // the serverless request budget now that this runs inside the chat turn.
  const voices: (Voiceover | null)[] = [];
  let voiceReason: string | undefined;
  let giveUp = false;

  for (let i = 0; i < script.scenes.length; i += SPEECH_CONCURRENCY) {
    const batch = script.scenes.slice(i, i + SPEECH_CONCURRENCY);

    // An exhausted quota will not recover inside one request, and this whole
    // pipeline runs inside a request with a timeout. Retrying every remaining
    // scene against a dead quota once cost 117 seconds and produced nothing, so
    // the first quota failure stops the rest.
    if (giveUp) {
      voices.push(...batch.map(() => null));
      continue;
    }

    const outcomes = await Promise.all(
      batch.map((scene) => speakWithRetry(keys, scene.voiceover)),
    );
    for (const outcome of outcomes) {
      voices.push(outcome.voice);
      if (!outcome.voice) {
        voiceReason ??= outcome.reason;
        if (outcome.terminal) giveUp = true;
      }
    }
  }

  const hook = await hookPromise;

  const spoken = voices.filter((voice) => voice && voice.audio.byteLength > 0).length;
  if (spoken === 0) {
    missing.push("voiceover");
  } else if (spoken < script.scenes.length) {
    missing.push(`voiceover on ${script.scenes.length - spoken} of ${script.scenes.length} scenes`);
  }

  // Played straight from Pexels' CDN. Nothing to download, nothing to store.
  const hookFile: string | null = hook?.videoUrl || null;
  if (!hookFile) missing.push("hook clip");

  // Images are fetched only to read their dimensions, then the bytes are thrown
  // away and the browser loads the original URL. Measuring still matters: a
  // landscape og:image in a portrait phone frame loses its headline.
  const imageUrls = pickProductImages(site, script.scenes.length);
  const usableImages: { file: string; fit: "phone" | "wide" }[] = [];

  for (const url of imageUrls) {
    const bytes = await fetchBytes(url);
    if (!bytes) continue; // unreachable now is unreachable for the browser too

    let fit: "phone" | "wide" = "wide";
    const size = readImageSize(bytes);
    if (size && size.height > 0) {
      fit = size.width / size.height < 0.85 ? "phone" : "wide";
    }
    usableImages.push({ file: url, fit });
  }
  if (usableImages.length === 0) missing.push("product screenshots");

  const scenes: SceneAsset[] = [];
  for (const [index, scene] of script.scenes.entries()) {
    const voice = voices[index];
    let audioFile: string | null = null;
    let spokenSec = 0;

    if (voice && voice.source !== "none" && voice.audio.byteLength > 0) {
      // Inlined as a data URI rather than served from a server-side cache.
      // The app runs on serverless instances that do not share memory, so a
      // cached asset would 404 as soon as the Player asked a different one.
      // Nothing is stored anywhere as a result — the video travels whole.
      audioFile = `data:audio/wav;base64,${Buffer.from(voice.audio).toString("base64")}`;
      spokenSec = wavDurationSec(voice.audio);
    }

    // The script's duration is a guess; the audio is a fact. Take whichever is
    // longer so a line is never cut off mid-word.
    const durationSec = Math.min(
      MAX_SCENE_SEC,
      Math.max(MIN_SCENE_SEC, scene.durationSec, spokenSec + TAIL_PADDING_SEC),
    );

    const usesHook = index === 0 && hookFile != null;
    const picked = usesHook
      ? undefined
      : usableImages[
          Math.max(0, index - (hookFile ? 1 : 0)) % Math.max(1, usableImages.length)
        ];

    scenes.push({
      index,
      durationSec,
      voiceover: scene.voiceover,
      onScreenText: scene.onScreenText,
      audioFile,
      // Scene 0 is the hook and gets the human clip; the rest show the product.
      videoFile: index === 0 ? hookFile : null,
      imageFile: picked?.file ?? null,
      imageFit: picked?.fit ?? null,
    });
  }

  return {
    productName: brief.name,
    cta: brief.cta,
    accentColor: normalizeColor(brief.palette?.[0]) ?? "#1f6feb",
    scenes,
    totalDurationSec: scenes.reduce((total, scene) => total + scene.durationSec, 0),
    credit: hook?.credit,
    missing,
    voice: { spoken, total: script.scenes.length, reason: voiceReason },
  };
}

function normalizeColor(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : undefined;
}
