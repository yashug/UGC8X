import type { ProductBrief } from "@/lib/ai/types";
import type { ResolvedKeys } from "./keys";

/**
 * The human face in the opening seconds is what makes a clip read as UGC rather
 * than a product promo.
 *
 * Free lane is Pexels stock: real people, free for commercial use, instant, and
 * it cannot fail in a way that breaks a demo. The paid lane (fal.ai, M4+) swaps
 * in a genuinely generated creator clip behind the same interface.
 *
 * Worth knowing: Pexels' terms forbid implying the depicted person endorses the
 * product. Fine for a demo; a real product needs licensed creator footage or the
 * AI lane. See PLAN.md §12.
 */

export type HookClip = {
  videoUrl: string;
  posterUrl?: string;
  durationSec: number;
  source: "pexels" | "none";
  credit?: string;
};

type PexelsVideoFile = {
  link: string;
  width: number | null;
  height: number | null;
  quality: string | null;
  file_type: string | null;
};

type PexelsVideo = {
  id: number;
  duration: number;
  image: string;
  user?: { name?: string };
  video_files: PexelsVideoFile[];
};

/** Search terms that reliably return a person talking to or using a phone. */
function queriesFor(brief: ProductBrief): string[] {
  const audience = (brief.audience ?? "").toLowerCase();
  const base = ["person talking to camera selfie", "woman using smartphone at home"];

  if (/fitness|health|gym|diet|calorie|nutrition/.test(`${audience} ${brief.category ?? ""}`)) {
    base.unshift("young woman talking to camera fitness vlog");
  }
  return base;
}

export async function fetchHookClip(
  keys: ResolvedKeys,
  brief: ProductBrief,
  signal?: AbortSignal,
): Promise<HookClip> {
  const apiKey = keys.keys.pexels;
  if (!apiKey) {
    // No key is not an error: the video simply opens on a text card instead.
    return { videoUrl: "", durationSec: 0, source: "none" };
  }

  for (const query of queriesFor(brief)) {
    const url = new URL("https://api.pexels.com/videos/search");
    url.searchParams.set("query", query);
    url.searchParams.set("orientation", "portrait");
    url.searchParams.set("per_page", "10");

    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: apiKey }, signal });
    } catch {
      continue;
    }
    if (!response.ok) continue;

    const body = (await response.json()) as { videos?: PexelsVideo[] };
    const candidate = (body.videos ?? [])
      .filter((video) => video.duration >= 3)
      .map((video) => ({ video, file: bestFile(video) }))
      .find((entry) => entry.file != null);

    if (candidate?.file) {
      return {
        videoUrl: candidate.file.link,
        posterUrl: candidate.video.image,
        durationSec: candidate.video.duration,
        source: "pexels",
        credit: candidate.video.user?.name
          ? `${candidate.video.user.name} / Pexels`
          : "Pexels",
      };
    }
  }

  return { videoUrl: "", durationSec: 0, source: "none" };
}

/** Prefer a portrait file around 1080 wide — big enough to look sharp, small enough to fetch. */
function bestFile(video: PexelsVideo): PexelsVideoFile | undefined {
  const portrait = video.video_files.filter(
    (file) => file.width != null && file.height != null && file.height > file.width,
  );
  const pool = portrait.length > 0 ? portrait : video.video_files;

  return pool
    .filter((file) => (file.file_type ?? "").includes("mp4"))
    .sort((a, b) => Math.abs((a.width ?? 0) - 1080) - Math.abs((b.width ?? 0) - 1080))[0];
}
