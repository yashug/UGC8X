import { ensureSessionId, getSessionId } from "@/lib/keys/session";
import { deleteKey, maskedKeys, saveKey } from "@/lib/keys/store";
import { validateKey } from "@/lib/keys/validate";
import { CAPABILITIES } from "@/lib/providers/capabilities";
import { PROVIDERS, type ProviderName } from "@/lib/providers/keys";

const SERVER_ENV: Record<ProviderName, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  fal: "FAL_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  pexels: "PEXELS_API_KEY",
};

function status(sessionId: string | null) {
  const masks = sessionId ? maskedKeys(sessionId) : {};

  return CAPABILITIES.map((capability) => {
    const mask = masks[capability.provider];
    const hasServer = Boolean(process.env[SERVER_ENV[capability.provider]]);

    return {
      ...capability,
      // Precedence, and it is the user's key that wins.
      source: mask ? "user" : hasServer ? "server" : "none",
      mask: mask ?? null,
    };
  });
}

export async function GET() {
  return Response.json(
    { capabilities: status(await getSessionId()) },
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

  // Checked before it is stored, so a bad key fails here and not two minutes
  // into a render.
  const validation = await validateKey(provider, key);
  if (!validation.ok) {
    return Response.json({ error: validation.reason }, { status: 400 });
  }

  const sessionId = await ensureSessionId();
  saveKey(sessionId, provider, key.trim());

  return Response.json({
    capabilities: status(sessionId),
    // Says plainly when a key was stored without being checked.
    verified: validation.verified,
    note: validation.note ?? null,
  });
}

export async function DELETE(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider") as ProviderName | null;
  if (!provider || !PROVIDERS.includes(provider)) {
    return Response.json({ error: "Unknown provider." }, { status: 400 });
  }

  const sessionId = await getSessionId();
  if (sessionId) deleteKey(sessionId, provider);

  return Response.json({ capabilities: status(sessionId) });
}
