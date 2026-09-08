import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2, via the S3 API.
 *
 * R2 is the free-lane choice for one specific reason: 10GB of storage and, more
 * importantly, no egress fee. Video is the one asset class where egress is what
 * actually costs money.
 */

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;

/** Set when the bucket is served from a public domain; otherwise links are signed. */
const PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL;

const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // the SigV4 maximum

export function isR2Configured(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured.");
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID!,
      secretAccessKey: SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

export async function putObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * A URL anyone can fetch: the public domain when there is one, otherwise a signed
 * link. Signing means the bucket never has to be world-readable, at the cost of
 * the link expiring after a week.
 */
export async function publicUrl(key: string): Promise<string> {
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }

  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: SIGNED_URL_TTL_SEC,
  });
}

export async function uploadAndSign(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<string> {
  await putObject(key, body, contentType);
  return publicUrl(key);
}
