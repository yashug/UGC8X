import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { ResolvedKeys } from "./keys";

/**
 * Free lane is Gemini Flash: no card, ~1,500 requests a day, good tool calling.
 * An Anthropic key — the user's or ours — upgrades routing and scriptwriting.
 */
/**
 * Chat and scriptwriting deliberately run on DIFFERENT Google models.
 *
 * The free tier meters per model — gemini-3.5-flash allows only 20 requests a
 * day — and one video costs four or five calls, so a single model runs dry after
 * a couple of renders. Splitting routing onto Flash-Lite and scriptwriting onto
 * Flash draws from two separate buckets and roughly doubles what the free lane
 * can do, while putting the better model where quality actually shows.
 *
 * (gemini-2.5-flash is not an option: it is closed to new keys.)
 */
export const MODELS = {
  googleChat: process.env.GOOGLE_CHAT_MODEL ?? "gemini-3.5-flash-lite",
  googleScript: process.env.GOOGLE_SCRIPT_MODEL ?? "gemini-3.6-flash",
  anthropicChat: process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-6",
  anthropicScript: process.env.ANTHROPIC_SCRIPT_MODEL ?? "claude-opus-5",
} as const;

export type LlmChoice = {
  model: LanguageModel;
  modelId: string;
  provider: "anthropic" | "google";
};

export class NoLlmKeyError extends Error {
  constructor() {
    super("No language model key is configured.");
    this.name = "NoLlmKeyError";
  }
}

function pick(resolved: ResolvedKeys, kind: "chat" | "script"): LlmChoice {
  const { keys } = resolved;

  if (keys.anthropic) {
    const anthropic = createAnthropic({ apiKey: keys.anthropic });
    const modelId = kind === "chat" ? MODELS.anthropicChat : MODELS.anthropicScript;
    return { model: anthropic(modelId), modelId, provider: "anthropic" };
  }

  if (keys.google) {
    const google = createGoogleGenerativeAI({ apiKey: keys.google });
    const modelId = kind === "chat" ? MODELS.googleChat : MODELS.googleScript;
    return { model: google(modelId), modelId, provider: "google" };
  }

  throw new NoLlmKeyError();
}

export const chatModel = (resolved: ResolvedKeys) => pick(resolved, "chat");
export const scriptModel = (resolved: ResolvedKeys) => pick(resolved, "script");
