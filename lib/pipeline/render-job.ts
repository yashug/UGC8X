import path from "node:path";
import { rm } from "node:fs/promises";

import type { LanguageModel } from "ai";
import type { JobData, JobStage, JobStageName } from "@/lib/ai/types";
import { putJob } from "@/lib/jobs/store";
import type { SiteExtract } from "@/lib/product/extract";
import type { ResolvedKeys } from "@/lib/providers/keys";
import { buildAssets } from "./assets";
import { renderVideo, resetBundle } from "@/lib/render/local";

export const RENDER_ROOT = path.resolve(process.cwd(), ".renders");

/**
 * Stages 5-7, which run *after* the chat turn has ended.
 *
 * A render takes a minute or more, far longer than a request may stay open, so
 * this is started without being awaited and reports progress into the job store
 * for the card to poll. Nothing here may throw into the caller.
 */
export async function runRenderJob({
  job,
  keys,
  site,
}: {
  job: JobData;
  keys: ResolvedKeys;
  site: SiteExtract;
  model?: LanguageModel;
}): Promise<void> {
  const assetDir = path.join(RENDER_ROOT, job.jobId, "assets");
  const outputDir = path.join(RENDER_ROOT, job.jobId);

  let current: JobData = { ...job, status: "running", notImplemented: false };
  const save = () => putJob(current);

  const setStage = (
    name: JobStageName,
    status: JobStage["status"],
    detail?: string,
  ) => {
    current = {
      ...current,
      stages: current.stages.map((stage) =>
        stage.name === name ? { ...stage, status, ...(detail ? { detail } : {}) } : stage,
      ),
    };
    save();
  };

  save();

  try {
    if (!current.brief || !current.script) {
      throw new Error("Nothing to render: the brief or script is missing.");
    }

    setStage("assets", "active");
    const assets = await buildAssets({
      dir: assetDir,
      keys,
      brief: current.brief,
      script: current.script,
      site,
    });

    setStage(
      "assets",
      "done",
      assets.missing.length > 0
        ? `no ${assets.missing.join(", ")} — using fallbacks`
        : `${assets.scenes.length} scenes, ${Math.round(assets.totalDurationSec)}s`,
    );

    setStage("render", "active", "0%");
    // Each job has its own asset dir, so the previous bundle cannot be reused.
    resetBundle();
    let lastReported = 0;
    const { outputPath, durationSec } = await renderVideo({
      assets,
      assetDir,
      outputDir,
      jobId: current.jobId,
      onProgress: (ratio) => {
        const percent = Math.round(ratio * 100);
        // Saving on every frame would be pure churn for the poller.
        if (percent >= lastReported + 5) {
          lastReported = percent;
          setStage("render", "active", `${percent}%`);
        }
      },
    });
    setStage("render", "done", `${Math.round(durationSec)}s of video`);

    setStage("deliver", "active");
    current = {
      ...current,
      status: "done",
      videoUrl: `/api/video/${current.jobId}`,
    };
    setStage("deliver", "done", path.basename(outputPath));

    // The rendered mp4 is kept; only the raw source assets are disposable.
    await rm(assetDir, { recursive: true, force: true }).catch(() => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const active = current.stages.find((stage) => stage.status === "active");
    if (active) setStage(active.name, "failed");
    current = { ...current, status: "failed", error: `Render failed: ${message}` };
    save();
  }
}
