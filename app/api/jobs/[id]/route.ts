import { getJob } from "@/lib/jobs/store";

/** Polled by the job card while a render is in flight. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = getJob(id);

  if (!job) {
    return Response.json({ error: "No such job." }, { status: 404 });
  }

  return Response.json(job, {
    headers: { "cache-control": "no-store" },
  });
}
