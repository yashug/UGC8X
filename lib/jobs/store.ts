import type { JobData } from "@/lib/ai/types";

/**
 * In-memory job store.
 *
 * Rendering outlives the chat request, so the card polls for updates after the
 * stream closes and something has to hold the state in between. A module-level
 * Map is correct for a single local process and WRONG for serverless, where each
 * instance would hold its own copy. M5 replaces this with Postgres; the
 * interface is deliberately small so that swap is contained.
 */

const jobs = new Map<string, JobData>();
const MAX_JOBS = 200;

export function putJob(job: JobData): void {
  jobs.set(job.jobId, job);

  // Keep the map from growing without bound in a long dev session.
  if (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value;
    if (oldest) jobs.delete(oldest);
  }
}

export function getJob(jobId: string): JobData | undefined {
  return jobs.get(jobId);
}
