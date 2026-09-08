import { validateKey } from "@/lib/keys/validate";
import { CAPABILITIES } from "@/lib/providers/capabilities";
import { PROVIDERS, type ProviderName } from "@/lib/providers/keys";

/**
 * Keys are held by the browser, not by this server.
 *
 * They used to be encrypted and kept server-side, because the render ran minutes
 * after the request that started it and needed to read them. Nothing runs after
 * the response any more, so that storage bought nothing and could not work across
 * serverless instances anyway. The browser keeps its own keys and sends them per
 * request; this endpoint only reports what the server can do on its own, and
 * checks a key before the browser commits to it.
 */

const SERVER_ENV: Record<ProviderName, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  fal: "FAL_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  pexels: "PEXELS_API_KEY",
};

export async function GET() {
  return Response.json(
    {
      capabilities: CAPABILITIES.map((capability) => ({
        ...capability,
        serverHasKey: Boolean(process.env[SERVER_ENV[capability.provider]]),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    provider?: string;
    key?: string;
  } | null;

  const provider = body?.provider as ProviderName | undefined;
  const key = body?.key;

  if (!provider || !PROVIDERS.includes(provider) || typeof key !== "string") {
    return Response.json({ error: "Provider and key are required." }, { status: 400 });
  }

  // Checked before the browser saves it, so a bad key fails at paste time rather
  // than halfway through a video.
  const validation = await validateKey(provider, key);
  if (!validation.ok) {
    return Response.json({ error: validation.reason }, { status: 400 });
  }

  // Deliberately not stored. The response says it is usable; the browser keeps it.
  return Response.json({ verified: validation.verified, note: validation.note ?? null });
}
