import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { RENDER_ROOT } from "@/lib/pipeline/render-job";

/** Serves a locally rendered mp4. M4 replaces this with an R2 public URL. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // The id reaches us from a URL, so it must never be able to walk the tree.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const file = path.join(RENDER_ROOT, id, `${id}.mp4`);

  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;

  return new Response(stream, {
    headers: {
      "content-type": "video/mp4",
      "content-length": String(size),
      "cache-control": "no-store",
      "content-disposition": `inline; filename="${id}.mp4"`,
    },
  });
}
