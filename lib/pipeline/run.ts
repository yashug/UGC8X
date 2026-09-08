import type { LanguageModel } from "ai";

import { generateBrief } from "@/lib/ai/brief";
import { generateScript } from "@/lib/ai/script";
import type { JobData, JobStageName, JobStage } from "@/lib/ai/types";
import { initialStages } from "@/lib/ai/types";
import { extractSite, type SiteExtract } from "@/lib/product/extract";
import { fetchSite, UnreachableSiteError } from "@/lib/product/fetch";

export type PipelineUpdate = (job: JobData) => void;

export type PipelineOptions = {
  job: JobData;
  /** The scriptwriting model, which is not the same one that routes chat. */
  model: LanguageModel;
  angle?: string;
  onUpdate: PipelineUpdate;
};

/**
 * M2 runs stages 1-4 inline: the whole point of the "streamed visibly" UX is that
 * the user reads the brief and the script while they wait. They complete in about
 * ten seconds, which is fine to hold the turn open for.
 *
 * Stages 5-7 (assets, render, deliver) will NOT run here — a render is minutes
 * long and has to be handed to a durable job. That is M3/M4.
 */
export const INLINE_STAGES: JobStageName[] = ["fetch", "extract", "brief", "script"];

export type BriefResult = {
  job: JobData;
  /** Kept so the render stage can reuse the page's images without refetching. */
  site?: SiteExtract;
};

export async function runBriefPipeline({
  job,
  model,
  angle,
  onUpdate,
}: PipelineOptions): Promise<BriefResult> {
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

  const fail = (message: string): BriefResult => {
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

    onUpdate(current);

    return { job: current, site: extract };
  } catch (error) {
    if (error instanceof UnreachableSiteError) {
      setStage("fetch", "failed", error.kind);
      return fail(error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Something broke while reading that site: ${message}`);
  }
}
