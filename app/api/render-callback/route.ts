import { getJob, putJob } from "@/lib/jobs/store";
import { verifySignature } from "@/lib/render/dispatch";

/**
 * Where the GitHub Actions runner reports back.
 *
 * This endpoint is public, so anyone could POST to it claiming a job is finished.
 * Every request must carry an HMAC of its own body, signed with a secret only the
 * server and the workflow hold.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-ugc8x-signature") ?? "";

  if (!verifySignature(raw, signature)) {
    return Response.json({ error: "Bad signature." }, { status: 401 });
  }

  let body: {
    jobId?: string;
    videoUrl?: string;
    stage?: string;
    error?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Bad payload." }, { status: 400 });
  }

  const job = body.jobId ? getJob(body.jobId) : undefined;
  if (!job) {
    return Response.json({ error: "No such job." }, { status: 404 });
  }

  if (body.error) {
    putJob({
      ...job,
      status: "failed",
      error: `Render failed on the runner: ${body.error}`.slice(0, 300),
      stages: job.stages.map((stage) =>
        stage.name === "render" ? { ...stage, status: "failed" } : stage,
      ),
    });
    return Response.json({ ok: true });
  }

  if (body.videoUrl) {
    putJob({
      ...job,
      status: "done",
      videoUrl: body.videoUrl,
      stages: job.stages.map((stage) =>
        stage.name === "render" || stage.name === "deliver"
          ? { ...stage, status: "done" }
          : stage,
      ),
    });
    return Response.json({ ok: true });
  }

  // A progress ping between the coarse stages the runner can report.
  if (body.stage) {
    putJob({
      ...job,
      stages: job.stages.map((stage) =>
        stage.name === "render"
          ? { ...stage, status: "active", detail: body.stage!.slice(0, 60) }
          : stage,
      ),
    });
  }

  return Response.json({ ok: true });
}
