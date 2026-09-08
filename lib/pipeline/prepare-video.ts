import type { JobData, JobStage } from "@/lib/ai/types";
import { putJob } from "@/lib/jobs/store";
import type { SiteExtract } from "@/lib/product/extract";
import type { ResolvedKeys } from "@/lib/providers/keys";
import type { UgcVideoProps } from "@/remotion/schema";
import { buildAssets, voiceWarnings } from "./assets";

/**
 * The last stage: gather the assets the Player needs.
 *
 * There is no render. The browser assembles the video live from a Remotion
 * Player, so once the voiceover exists and the imagery has been checked, the job
 * is done and the card can play it. Nothing is encoded, uploaded or stored.
 *
 * Still detached from the chat turn: speech is generated one scene at a time and
 * that takes long enough to be worth polling for.
 */
export async function prepareVideo({
  job,
  keys,
  site,
}: {
  job: JobData;
  keys: ResolvedKeys;
  site: SiteExtract;
}): Promise<void> {
  let current: JobData = { ...job, status: "running" };
  const save = () => putJob(current);

  const setStage = (status: JobStage["status"], detail?: string) => {
    current = {
      ...current,
      stages: current.stages.map((stage) =>
        stage.name === "assets" ? { ...stage, status, ...(detail ? { detail } : {}) } : stage,
      ),
    };
    save();
  };

  save();

  try {
    if (!current.brief || !current.script) {
      throw new Error("Nothing to assemble: the brief or script is missing.");
    }

    setStage("active");

    const assets = await buildAssets({
      jobId: current.jobId,
      keys,
      brief: current.brief,
      script: current.script,
      site,
    });

    // A missing voiceover is not a footnote: say it on the card, and say why.
    const warnings = voiceWarnings(assets.voice);

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

    current = {
      ...current,
      status: "done",
      video,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
    setStage(
      "done",
      `${assets.scenes.length} scenes, ${Math.round(assets.totalDurationSec)}s`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStage("failed");
    current = { ...current, status: "failed", error: `Couldn't assemble the video: ${message}` };
    save();
  }
}
