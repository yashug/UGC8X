import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { VideoAssets } from "@/lib/pipeline/assets";
import { isR2Configured, publicUrl, putObject, uploadAndSign } from "@/lib/storage/r2";
import type { UgcVideoProps } from "@/remotion/schema";

/**
 * Hands a render to a GitHub Actions runner.
 *
 * Vercel cannot render a video — a function will not stay alive for the minute or
 * two it takes — so the work goes somewhere that will. Actions is free, needs no
 * AWS account, and costs about a minute of runner boot per job.
 *
 * The runner never receives an API key. Every asset that needs one is produced
 * here first and uploaded to R2, so the payload is nothing but URLs.
 */

const GH_TOKEN = process.env.GH_RENDER_TOKEN;
const GH_REPO = process.env.GH_RENDER_REPO; // "owner/repo"
const GH_WORKFLOW = process.env.GH_RENDER_WORKFLOW ?? "render.yml";
const GH_REF = process.env.GH_RENDER_REF ?? "main";
// Read lazily rather than at module load: serverless instances are reused across
// config changes, and it keeps the signing functions testable.
const callbackSecret = () => process.env.RENDER_CALLBACK_SECRET;
const publicAppUrl = () => process.env.PUBLIC_APP_URL;

export function isRemoteRenderConfigured(): boolean {
  return Boolean(
    GH_TOKEN && GH_REPO && callbackSecret() && publicAppUrl() && isR2Configured(),
  );
}

export function signPayload(body: string): string {
  const secret = callbackSecret();
  if (!secret) throw new Error("RENDER_CALLBACK_SECRET is not set.");
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Constant-time compare: a callback endpoint is a public forgery target. */
export function verifySignature(body: string, signature: string): boolean {
  if (!callbackSecret() || !signature) return false;
  const expected = Buffer.from(signPayload(body), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function contentType(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Uploads every local asset and rewrites the props to point at R2. */
export async function uploadAssets(
  jobId: string,
  assets: VideoAssets,
  assetDir: string,
): Promise<UgcVideoProps> {
  const upload = async (file: string | null): Promise<string | null> => {
    if (!file) return null;
    const bytes = await readFile(path.join(assetDir, file));
    return uploadAndSign(`jobs/${jobId}/assets/${file}`, bytes, contentType(file));
  };

  const scenes = await Promise.all(
    assets.scenes.map(async (scene) => ({
      index: scene.index,
      durationSec: scene.durationSec,
      voiceover: scene.voiceover,
      onScreenText: scene.onScreenText,
      audioFile: await upload(scene.audioFile),
      imageFile: await upload(scene.imageFile),
      videoFile: await upload(scene.videoFile),
      imageFit: scene.imageFit,
    })),
  );

  return {
    productName: assets.productName,
    cta: assets.cta,
    accentColor: assets.accentColor,
    credit: assets.credit,
    scenes,
  };
}

/**
 * Dispatch inputs are capped at 64KB and a script can exceed that once asset URLs
 * are signed, so the payload goes to R2 and only its URL is passed.
 */
export async function dispatchRender(
  jobId: string,
  props: UgcVideoProps,
): Promise<void> {
  if (!isRemoteRenderConfigured()) {
    throw new Error("Remote rendering is not configured.");
  }

  const payloadKey = `jobs/${jobId}/payload.json`;
  await putObject(
    payloadKey,
    Buffer.from(JSON.stringify(props), "utf8"),
    "application/json",
  );
  const payloadUrl = await publicUrl(payloadKey);

  const response = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${GH_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: GH_REF,
        inputs: {
          jobId,
          payloadUrl,
          callbackUrl: `${publicAppUrl()!.replace(/\/$/, "")}/api/render-callback`,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Never echo the token back into an error that reaches a user.
    throw new Error(
      `GitHub refused the render dispatch (${response.status}). ${detail.slice(0, 200)}`,
    );
  }
}
