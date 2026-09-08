import type { LanguageModel } from "ai";

import { describeError } from "@/lib/ai/errors";
import { generateBrief } from "@/lib/ai/brief";
import { generateScript } from "@/lib/ai/script";
import type { ResolvedKeys } from "@/lib/providers/keys";
import type { UgcVideoProps } from "@/remotion/schema";
import { buildAssets, voiceWarnings } from "./assets";
import type { JobData, JobStageName, JobStage } from "@/lib/ai/types";
import { initialStages } from "@/lib/ai/types";
import { extractSite } from "@/lib/product/extract";
import { fetchSite, UnreachableSiteError } from "@/lib/product/fetch";

export type PipelineUpdate = (job: JobData) => void;

export type PipelineOptions = {
  job: JobData;
  /** The scriptwriting model, which is not the same one that routes chat. */
  model: LanguageModel;
  angle?: string;
  keys: ResolvedKeys;
  onUpdate: PipelineUpdate;
};

/**
 * Every stage runs inside the chat request.
 *
 * That is a deliberate consequence of deploying to serverless. An earlier design
 * built the assets after the response had been sent and let the card poll a job
 * store for updates — which cannot work when each request may land on a different
 * instance with its own memory, and when the instance is frozen the moment the
 * response ends. Doing the work in the request removes the job store, the asset
 * store, the polling endpoint and the whole class of bug with them.
 *
 * The cost is a request that runs for roughly half a minute. The brief and the
 * script stream into the thread while it does, which is what fills the wait.
 */

export type PipelineResult = {
  job: JobData;
};

export async function runVideoPipeline({
  job,
  model,
  angle,
  keys,
  onUpdate,
}: PipelineOptions): Promise<PipelineResult> {
  let current: JobData = { ...job, status: "running", stages: initialStages() };

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
    onUpdate(current);
  };

  const fail = (message: string): PipelineResult => {
    current = { ...current, status: "failed", error: message };
    onUpdate(current);
    return { job: current };
  };

  try {
    setStage("fetch", "active");
    const site = await fetchSite(current.url);
    setStage("fetch", "done", new URL(site.finalUrl).hostname);

    setStage("extract", "active");
    const extract = extractSite(site.html, site.finalUrl);
    if (extract.isThin) {
      // A JS-only shell gives the model nothing to read. Say so rather than
      // letting it invent a product. A headless fallback is the M3 upgrade.
      setStage("extract", "failed", "page rendered no readable text");
      return fail(
        "That page renders its content with JavaScript, so I couldn't read anything from it. Tell me about the product in a sentence and I'll work from that.",
      );
    }
    setStage(
      "extract",
      "done",
      `${extract.headings.length} headings, ${extract.images.length} images`,
    );

    setStage("brief", "active");
    const brief = await generateBrief(model, extract);
    current = { ...current, brief, productName: brief.name };
    setStage("brief", "done", brief.oneLiner);

    setStage("script", "active");
    const script = await generateScript(model, brief, angle);
    current = { ...current, script };
    setStage("script", "done", `${script.scenes.length} scenes, ${script.totalDurationSec}s`);

    setStage("assets", "active");
    const assets = await buildAssets({
      keys,
      brief,
      script,
      site: extract,
    });

    const video: UgcVideoProps = {
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

    const warnings = voiceWarnings(assets.voice);
    current = {
      ...current,
      status: "done",
      video,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
    setStage(
      "assets",
      "done",
      `${assets.scenes.length} scenes, ${Math.round(assets.totalDurationSec)}s`,
    );

    return { job: current };
  } catch (error) {
    if (error instanceof UnreachableSiteError) {
      setStage("fetch", "failed", error.kind);
      return fail(error.message);
    }
    // A quota failure is by far the most likely thing to go wrong on the shared
    // key, and it is the one the user can actually do something about, so it gets
    // the explanation rather than a raw provider string.
    return fail(describeError(error));
  }
}
