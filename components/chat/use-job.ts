"use client";

import { useEffect, useState } from "react";
import type { JobData } from "@/lib/ai/types";

const POLL_MS = 1500;

function isSettled(job: JobData): boolean {
  return job.status === "done" || job.status === "failed";
}

/** How far along a snapshot is, so the more advanced of two always wins. */
function progress(job: JobData): number {
  const finished = job.stages.filter(
    (stage) => stage.status === "done" || stage.status === "failed",
  ).length;
  return finished * 10 + (isSettled(job) ? 5 : 0);
}

/**
 * The chat stream closes when the assistant stops talking, but the render keeps
 * going for another minute or two. From that point the card polls for its own
 * updates.
 *
 * Polling rather than SSE on purpose: a serverless function is capped well below
 * a render's length, so a stream would drop mid-render anyway.
 *
 * The two sources are reconciled by picking whichever snapshot is further along,
 * rather than by copying one into the other — that keeps it a derivation instead
 * of a second source of truth that can fight the first.
 */
export function useLiveJob(streamed: JobData): JobData {
  const [polled, setPolled] = useState<JobData | null>(null);

  const job =
    polled && polled.jobId === streamed.jobId && progress(polled) >= progress(streamed)
      ? polled
      : streamed;

  const settled = isSettled(job);
  const { jobId } = streamed;

  useEffect(() => {
    if (settled) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as JobData;
        if (!cancelled) setPolled(next);
      } catch {
        // A dropped poll is not worth surfacing; the next one catches up.
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, settled]);

  return job;
}
