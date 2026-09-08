#!/usr/bin/env node
/**
 * Runs only when the render step failed, so the job in the app becomes "failed"
 * instead of hanging on "rendering" forever.
 */
import { createHmac } from "node:crypto";

const { JOB_ID, CALLBACK_URL, RENDER_CALLBACK_SECRET, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } =
  process.env;

const runUrl =
  GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : "the workflow run";

const raw = JSON.stringify({
  jobId: JOB_ID,
  error: `the render step failed. See ${runUrl}`,
});
const signature = createHmac("sha256", RENDER_CALLBACK_SECRET).update(raw).digest("hex");

await fetch(CALLBACK_URL, {
  method: "POST",
  headers: { "content-type": "application/json", "x-ugc8x-signature": signature },
  body: raw,
}).catch(() => undefined);
