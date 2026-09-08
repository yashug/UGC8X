import path from "node:path";
import { rm } from "node:fs/promises";

import type { LanguageModel } from "ai";
import type { JobData, JobStage, JobStageName } from "@/lib/ai/types";
import { putJob } from "@/lib/jobs/store";
import type { SiteExtract } from "@/lib/product/extract";
import type { ResolvedKeys } from "@/lib/providers/keys";
import { buildAssets, voiceWarnings } from "./assets";
import { dispatchRender, isRemoteRenderConfigured, uploadAssets } from "@/lib/render/dispatch";
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

    // A missing voiceover is not a footnote: say it on the card, and say why.
    const warnings = voiceWarnings(assets.voice);
    if (warnings.length > 0) {
      current = { ...current, warnings };
      save();
    }

    setStage(
      "assets",
      "done",
      assets.missing.length > 0
        ? `no ${assets.missing.join(", ")} — using fallbacks`
        : `${assets.scenes.length} scenes, ${Math.round(assets.totalDurationSec)}s`,
    );

    // Two renderers behind one decision. Remote is used when it is fully
    // configured; otherwise this falls back to rendering here, so a missing
    // GitHub token degrades to "slower and local" rather than "broken".
    if (isRemoteRenderConfigured()) {
      setStage("render", "active", "handing off to the runner");
      const props = await uploadAssets(current.jobId, assets, assetDir);
      await dispatchRender(current.jobId, props);

      // The runner reports progress and the finished URL to /api/render-callback,
      // which advances the job from there. Nothing further to do here.
      await rm(assetDir, { recursive: true, force: true }).catch(() => undefined);
      return;
    }

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
