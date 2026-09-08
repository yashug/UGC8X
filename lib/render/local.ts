import path from "node:path";
import { mkdir } from "node:fs/promises";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

import type { VideoAssets } from "@/lib/pipeline/assets";
import { FPS, type UgcVideoProps } from "@/remotion/schema";

/**
 * M3 renders on this machine. That is fine locally and impossible on Vercel,
 * where a function cannot stay alive long enough — M4 moves this exact call onto
 * a GitHub Actions runner. Everything either side of it stays the same.
 */

let bundlePromise: Promise<string> | null = null;

/** Bundling takes ~10s, so do it once per process and reuse it. */
function getBundle(assetDir: string): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.resolve(process.cwd(), "remotion/index.ts"),
      // Assets live outside public/ so writing them cannot trigger Next's dev
      // file watcher and reload the app mid-render.
      publicDir: assetDir,
      onProgress: () => undefined,
    });
  }
  return bundlePromise;
}

export type RenderResult = {
  outputPath: string;
  durationSec: number;
};

export async function renderVideo({
  assets,
  assetDir,
  outputDir,
  jobId,
  onProgress,
}: {
  assets: VideoAssets;
  assetDir: string;
  outputDir: string;
  jobId: string;
  onProgress?: (ratio: number) => void;
}): Promise<RenderResult> {
  await mkdir(outputDir, { recursive: true });

  const inputProps: UgcVideoProps = {
    productName: assets.productName,
    cta: assets.cta,
    accentColor: assets.accentColor,
    credit: assets.credit,
    scenes: assets.scenes.map((scene) => ({
      index: scene.index,
      durationSec: scene.durationSec,
      voiceover: scene.voiceover,
      onScreenText: scene.onScreenText,
      audioFile: scene.audioFile,
      imageFile: scene.imageFile,
      videoFile: scene.videoFile,
      imageFit: scene.imageFit,
    })),
  };

  const serveUrl = await getBundle(assetDir);

  const composition = await selectComposition({
    serveUrl,
    id: "UgcVideo",
    inputProps,
  });

  const outputPath = path.join(outputDir, `${jobId}.mp4`);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
  });

  return { outputPath, durationSec: composition.durationInFrames / FPS };
}

/**
 * The bundle embeds a publicDir, so a new job's assets need a fresh one.
 * Called between renders; cheap because webpack caching survives.
 */
export function resetBundle() {
  bundlePromise = null;
}
