import { getAsset } from "@/lib/assets/store";

/** Serves the generated voiceover to the Player. Nothing here is persisted. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; name: string }> },
) {
  const { jobId, name } = await params;

  // Both segments come from a URL, so neither may walk out of its namespace.
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[a-z0-9._-]{1,64}$/i.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const asset = getAsset(jobId, name);
  if (!asset) return new Response("Not found", { status: 404 });

  return new Response(asset.bytes as unknown as BodyInit, {
    headers: {
      "content-type": asset.contentType,
      "content-length": String(asset.bytes.byteLength),
      "cache-control": "private, max-age=3600",
    },
  });
}
