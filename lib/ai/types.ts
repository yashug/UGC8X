/**
 * Shared shapes for the chat thread.
 *
 * The render job is streamed to the client as a *data part* rather than as text,
 * so the thread can show a live job card that updates in place while the rest of
 * the assistant's message streams normally around it.
 */

export type JobStageName =
  | "fetch"
  | "extract"
  | "brief"
  | "script"
  | "assets"
  | "render"
  | "deliver";

export type JobStageStatus = "pending" | "active" | "done" | "failed" | "skipped";

export type JobStage = {
  name: JobStageName;
  label: string;
  status: JobStageStatus;
  detail?: string;
};

export type ProductBrief = {
  name: string;
  oneLiner: string;
  category?: string;
  audience?: string;
  painPoints: string[];
  benefits: string[];
  proofPoints: string[];
  cta: string;
  palette?: string[];
};

export type VideoScene = {
  index: number;
  durationSec: number;
  voiceover: string;
  onScreenText: string;
  visual: string;
};

export type VideoScript = {
  totalDurationSec: number;
  scenes: VideoScene[];
};

export type JobData = {
  jobId: string;
  url: string;
  productName?: string;
  status: "queued" | "running" | "done" | "failed";
  stages: JobStage[];
  brief?: ProductBrief;
  script?: VideoScript;
  videoUrl?: string;
  error?: string;
  /** Set while the render pipeline is still being built out. */
  notImplemented?: boolean;
};

export const STAGE_LABELS: Record<JobStageName, string> = {
  fetch: "Reading the site",
  extract: "Pulling out the product",
  brief: "Understanding what it is",
  script: "Writing the script",
  assets: "Voiceover and footage",
  render: "Rendering the video",
  deliver: "Publishing",
};

export const STAGE_ORDER: JobStageName[] = [
  "fetch",
  "extract",
  "brief",
  "script",
  "assets",
  "render",
  "deliver",
];

export function initialStages(): JobStage[] {
  return STAGE_ORDER.map((name) => ({
    name,
    label: STAGE_LABELS[name],
    status: "pending" as const,
  }));
}
