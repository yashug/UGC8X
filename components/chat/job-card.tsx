"use client";

import type { JobData, JobStage, ProductBrief, VideoScript } from "@/lib/ai/types";
import { hostOf } from "@/lib/ai/url";
import { useLiveJob } from "./use-job";

function StageDot({ status }: { status: JobStage["status"] }) {
  if (status === "done") {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5 text-ok" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5 text-danger" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="m4 4 8 8M12 4l-8 8" />
      </svg>
    );
  }
  if (status === "active") {
    return <span className="animate-pulse-dot block size-1.5 rounded-full bg-accent" />;
  }
  if (status === "skipped") {
    return <span className="block h-px w-2.5 bg-faint" />;
  }
  return <span className="block size-1.5 rounded-full bg-line-strong" />;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">
      {children}
    </span>
  );
}

/**
 * The brief and the script are the whole point of the wait: they are what proves
 * the pipeline really read the site rather than returning something canned.
 */
function BriefBlock({ brief }: { brief: ProductBrief }) {
  return (
    <div className="animate-in-up border-t border-line px-4 py-3">
      <p className="text-[13px] leading-6 text-ink">{brief.oneLiner}</p>
      {brief.proofPoints.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {brief.proofPoints.map((point) => (
            <Chip key={point}>{point}</Chip>
          ))}
        </div>
      ) : null}
      {brief.painPoints.length > 0 ? (
        <p className="mt-2 text-[12px] leading-5 text-muted">
          <span className="text-faint">Pain — </span>
          {brief.painPoints.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function ScriptBlock({ script }: { script: VideoScript }) {
  return (
    <div className="animate-in-up border-t border-line px-4 py-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] font-medium text-ink">Script</p>
        <span className="font-mono text-[11px] text-faint">
          {script.totalDurationSec}s
        </span>
      </div>
      <ol className="mt-2 space-y-2">
        {script.scenes.map((scene) => (
          <li key={scene.index} className="flex gap-2.5">
            <span className="mt-0.5 w-8 shrink-0 font-mono text-[11px] text-faint">
              {scene.durationSec}s
            </span>
            <div className="min-w-0">
              <p className="text-[13px] leading-5 text-ink">{scene.voiceover}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-faint">
                {scene.onScreenText} — {scene.visual}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function JobCard({ job: streamed }: { job: JobData }) {
  // Keeps updating after the chat stream has closed.
  const job = useLiveJob(streamed);

  // Skipped stages are ones this milestone never runs; counting them would make a
  // finished job look permanently incomplete.
  const counted = job.stages.filter((stage) => stage.status !== "skipped");
  const done = counted.filter((stage) => stage.status === "done").length;

  return (
    <div className="animate-in-up overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">
            {job.productName ?? hostOf(job.url)}
          </p>
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer noopener"
            className="truncate font-mono text-[11px] text-faint underline-offset-2 hover:text-muted hover:underline"
          >
            {hostOf(job.url)}
          </a>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-faint">
          {done}/{counted.length}
        </span>
      </div>

      <ol className="px-4 py-3">
        {job.stages.map((stage) => (
          <li key={stage.name} className="flex items-center gap-2.5 py-[3px]">
            <span className="grid w-3.5 shrink-0 place-items-center">
              <StageDot status={stage.status} />
            </span>
            <span
              className={
                stage.status === "pending"
                  ? "text-[13px] text-faint"
                  : stage.status === "active"
                    ? "text-[13px] text-ink"
                    : "text-[13px] text-muted"
              }
            >
              {stage.label}
            </span>
            {stage.detail ? (
              <span className="truncate text-[12px] text-faint">— {stage.detail}</span>
            ) : null}
          </li>
        ))}
      </ol>

      {job.brief ? <BriefBlock brief={job.brief} /> : null}

      {job.script ? <ScriptBlock script={job.script} /> : null}

      {job.videoUrl ? (
        <div className="border-t border-line p-3">
          <video
            controls
            playsInline
            src={job.videoUrl}
            className="w-full rounded-lg bg-black"
          />
          <a
            href={job.videoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 block truncate font-mono text-[11px] text-accent underline-offset-2 hover:underline"
          >
            {job.videoUrl}
          </a>
        </div>
      ) : null}

      {job.warnings?.length ? (
        <ul className="border-t border-line bg-sunk px-4 py-2.5">
          {job.warnings.map((warning) => (
            <li key={warning} className="text-[12px] leading-5 text-muted">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      {job.error ? (
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-danger">
          {job.error}
        </p>
      ) : null}

      {job.notImplemented ? (
        <p className="border-t border-line bg-sunk px-4 py-2.5 text-[12px] text-muted">
          Script is ready. Rendering isn&apos;t connected yet, so no video is produced —
          footage and voiceover land in M3, the renderer in M4.
        </p>
      ) : null}
    </div>
  );
}
