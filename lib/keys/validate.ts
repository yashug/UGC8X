import type { ProviderName } from "@/lib/providers/keys";

/**
 * Probe a key before storing it, so a bad one fails here rather than two minutes
 * into a render.
 *
 * Not every provider makes this possible. Pexels answers a search identically
 * whether you send a valid key, a garbage key, or no key at all, so there is
 * nothing to check — an early version happily "validated" the string
 * "obviously-not-a-real-key". Rather than pretend, a result carries `verified`
 * and the UI says when a key was only stored, not checked.
 */
export type Validation =
  | { ok: true; verified: boolean; note?: string }
  | { ok: false; reason: string };

const TIMEOUT_MS = 10_000;

async function probe(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function validateKey(
  provider: ProviderName,
  key: string,
): Promise<Validation> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, reason: "That looks empty." };
  if (/\s/.test(trimmed)) {
    return { ok: false, reason: "That contains whitespace — check you copied it whole." };
  }

  switch (provider) {
    case "google": {
      const response = await probe(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}&pageSize=1`,
        {},
      );
      // Google answers a bad key with 400, not 401.
      return judge(response, "Google rejected that key.", [400, 401, 403]);
    }

    case "anthropic": {
      const response = await probe("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": trimmed, "anthropic-version": "2023-06-01" },
      });
      return judge(response, "Anthropic rejected that key.", [401, 403]);
    }

    case "elevenlabs": {
      const response = await probe("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": trimmed },
      });
      return judge(response, "ElevenLabs rejected that key.", [401, 403]);
    }

    case "pexels": {
      // Unverifiable: their search endpoint ignores the Authorization header.
      if (trimmed.length < 20) {
        return { ok: false, reason: "A Pexels key is longer than that." };
      }
      return {
        ok: true,
        verified: false,
        note: "Saved. Pexels gives no way to check a key, so this wasn't verified.",
      };
    }

    case "fal": {
      if (!/^[0-9a-f-]{8,}:[0-9a-f]{8,}$/i.test(trimmed)) {
        return { ok: false, reason: "A fal.ai key looks like `id:secret`." };
      }
      return {
        ok: true,
        verified: false,
        note: "Saved. The shape looks right, but fal.ai has no free endpoint to check it against.",
      };
    }

    default:
      return { ok: false, reason: "Unknown provider." };
  }
}

function judge(
  response: Response | null,
  rejection: string,
  rejectOn: number[],
): Validation {
  if (!response) return { ok: false, reason: "Couldn't reach the provider. Try again." };
  if (rejectOn.includes(response.status)) return { ok: false, reason: rejection };
  // A rate limit still proves the key is real, which is all we are asking.
  if (response.ok || response.status === 429) return { ok: true, verified: true };
  return { ok: false, reason: `Provider replied ${response.status}.` };
}
