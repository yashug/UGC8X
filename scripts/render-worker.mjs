#!/usr/bin/env node
/**
 * Runs on a GitHub Actions runner. Reads payload.json (already fetched from R2),
 * renders it with the same Remotion composition the app uses, uploads the mp4 to
 * R2, and calls the app back with a URL.
 *
 * It never receives an API key. Everything that needed one was produced by the
 * app and is referenced in the payload as a URL.
 */
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import path from "node:path";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  JOB_ID,
  CALLBACK_URL,
  RENDER_CALLBACK_SECRET,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
} = process.env;

async function report(body) {
  const raw = JSON.stringify({ jobId: JOB_ID, ...body });
  const signature = createHmac("sha256", RENDER_CALLBACK_SECRET).update(raw).digest("hex");

  await fetch(CALLBACK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ugc8x-signature": signature },
    body: raw,
  }).catch(() => undefined);
}

const props = JSON.parse(await readFile("payload.json", "utf8"));

await report({ stage: "bundling" });
const serveUrl = await bundle({
  entryPoint: path.resolve(process.cwd(), "remotion/index.ts"),
  // Every asset in the payload is an absolute R2 URL, so there is no public dir.
  publicDir: null,
  onProgress: () => undefined,
});

await report({ stage: "rendering" });
const composition = await selectComposition({ serveUrl, id: "UgcVideo", inputProps: props });

const outputPath = `${JOB_ID}.mp4`;
let lastReported = 0;

await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outputPath,
  inputProps: props,
  onProgress: ({ progress }) => {
    const percent = Math.round(progress * 100);
    if (percent >= lastReported + 20) {
      lastReported = percent;
      void report({ stage: `${percent}%` });
    }
  },
});

await report({ stage: "uploading" });
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const key = `jobs/${JOB_ID}/${JOB_ID}.mp4`;
await s3.send(
  new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: await readFile(outputPath),
    ContentType: "video/mp4",
  }),
);

const videoUrl = R2_PUBLIC_BASE_URL
  ? `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`
  : await getSignedUrl(s3, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), {
      expiresIn: 60 * 60 * 24 * 7,
    });

await report({ videoUrl });
console.log(`Rendered ${JOB_ID} -> ${videoUrl.split("?")[0]}`);
