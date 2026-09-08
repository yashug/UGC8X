"use client";

import type { JobData, JobStage } from "@/lib/ai/types";
import { hostOf } from "@/lib/ai/url";

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

export function JobCard({ job }: { job: JobData }) {
  const done = job.stages.filter((s) => s.status === "done").length;

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
          {done}/{job.stages.length}
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

      {job.error ? (
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-danger">
          {job.error}
        </p>
      ) : null}

      {job.notImplemented ? (
        <p className="border-t border-line bg-sunk px-4 py-2.5 text-[12px] text-muted">
          Job accepted, but the render pipeline isn&apos;t connected yet — no video will
          be produced. Milestones M3 and M4 wire up assets and rendering.
        </p>
      ) : null}
    </div>
  );
}
