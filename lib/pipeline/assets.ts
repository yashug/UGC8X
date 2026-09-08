import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ProductBrief, VideoScript } from "@/lib/ai/types";
import { downloadTo } from "@/lib/media/download";
import { readImageSize } from "@/lib/media/image-size";
import { wavDurationSec } from "@/lib/media/wav";
import type { SiteExtract } from "@/lib/product/extract";
import { fetchHookClip } from "@/lib/providers/hook";
import type { ResolvedKeys } from "@/lib/providers/keys";
import { generateVoiceover } from "@/lib/providers/voice";

/** What the Remotion composition needs, with every path relative to the asset dir. */
export type SceneAsset = {
  index: number;
  durationSec: number;
  voiceover: string;
  onScreenText: string;
  /** File name inside the asset dir, or null if this scene has no audio. */
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
};

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

export async function buildAssets({
  dir,
  keys,
  brief,
  script,
  site,
}: {
  dir: string;
  keys: ResolvedKeys;
  brief: ProductBrief;
  script: VideoScript;
  site: SiteExtract;
}): Promise<VideoAssets> {
  await mkdir(dir, { recursive: true });
  const missing: string[] = [];

  // Voiceover and the hook clip are independent, so fetch them together.
  const [voices, hook] = await Promise.all([
    Promise.all(
      script.scenes.map(async (scene) => {
        try {
          return await generateVoiceover(keys, scene.voiceover);
        } catch {
          return null;
        }
      }),
    ),
    fetchHookClip(keys, brief).catch(() => null),
  ]);

  if (voices.every((voice) => !voice || voice.source === "none")) {
    missing.push("voiceover");
  }

  let hookFile: string | null = null;
  if (hook?.videoUrl) {
    const saved = await downloadTo(hook.videoUrl, path.join(dir, "hook.mp4"));
    hookFile = saved ? "hook.mp4" : null;
  }
  if (!hookFile) missing.push("hook clip");

  const imageUrls = pickProductImages(site, script.scenes.length);
  const imageFiles: (string | null)[] = [];
  for (const [index, url] of imageUrls.entries()) {
    const extension = url.split("?")[0].match(/\.(png|jpe?g|webp)$/i)?.[0] ?? ".jpg";
    const name = `shot-${index}${extension}`;
    const saved = await downloadTo(url, path.join(dir, name));
    imageFiles.push(saved ? name : null);
  }
  // Measure what actually downloaded, so presentation follows the real shape.
  const measured: { file: string; fit: "phone" | "wide" }[] = [];
  for (const file of imageFiles) {
    if (!file) continue;
    let fit: "phone" | "wide" = "wide";
    try {
      const size = readImageSize(await readFile(path.join(dir, file)));
      if (size && size.height > 0) {
        fit = size.width / size.height < 0.85 ? "phone" : "wide";
      }
    } catch {
      // Unreadable header: treat it as wide, which crops nothing.
    }
    measured.push({ file, fit });
  }
  const usableImages = measured;
  if (usableImages.length === 0) missing.push("product screenshots");

  const scenes: SceneAsset[] = [];
  for (const [index, scene] of script.scenes.entries()) {
    const voice = voices[index];
    let audioFile: string | null = null;
    let spokenSec = 0;

    if (voice && voice.source !== "none" && voice.audio.byteLength > 0) {
      audioFile = `vo-${index}.wav`;
      await writeFile(path.join(dir, audioFile), voice.audio);
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
  };
}

function normalizeColor(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : undefined;
}
