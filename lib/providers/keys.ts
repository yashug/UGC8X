/**
 * Key resolution — the heart of the BYOK design.
 *
 * There is no tier flag. For each capability we take the best key available, in
 * order: the user's own key, then our server key, then the free default, then
 * nothing. A user who pastes a fal.ai key upgrades their hook clip on the next
 * render and changes nothing else.
 *
 * M1 note: user keys arrive per-request in a header and are used and discarded.
 * That is sufficient while the chat is synchronous. Once the render pipeline runs
 * asynchronously (M3+) a key must outlive the request, which is what the
 * encrypted, session-scoped store in M1b is for. See PLAN.md §5b.
 */

export const PROVIDERS = [
  "google",
  "anthropic",
  "fal",
  "elevenlabs",
  "pexels",
] as const;

export type ProviderName = (typeof PROVIDERS)[number];

export type ProviderKeys = Partial<Record<ProviderName, string>>;

export type KeySource = "user" | "server" | "none";

export type ResolvedKeys = {
  keys: ProviderKeys;
  sources: Record<ProviderName, KeySource>;
};

const SERVER_ENV: Record<ProviderName, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  fal: "FAL_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  pexels: "PEXELS_API_KEY",
};

/** Header the browser uses to pass keys it holds in localStorage. */
export const USER_KEYS_HEADER = "x-ugc8x-keys";

export function readUserKeys(req: Request): ProviderKeys {
  const raw = req.headers.get(USER_KEYS_HEADER);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ProviderKeys = {};
    for (const name of PROVIDERS) {
      const value = (parsed as Record<string, unknown>)[name];
      if (typeof value === "string" && value.trim()) out[name] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function resolveKeys(userKeys: ProviderKeys = {}): ResolvedKeys {
  const keys: ProviderKeys = {};
  const sources = {} as Record<ProviderName, KeySource>;

  for (const name of PROVIDERS) {
    const fromUser = userKeys[name];
    const fromServer = process.env[SERVER_ENV[name]];
    if (fromUser) {
      keys[name] = fromUser;
      sources[name] = "user";
    } else if (fromServer) {
      keys[name] = fromServer;
      sources[name] = "server";
    } else {
      sources[name] = "none";
    }
  }

  return { keys, sources };
}

/** Never let a key reach a log line or an error body intact. */
export function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function redact(text: string, keys: ProviderKeys): string {
  let out = text;
  for (const value of Object.values(keys)) {
    if (value && value.length > 6) out = out.split(value).join("[redacted]");
  }
  return out;
}
