import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { ResolvedKeys } from "./keys";

/**
 * Free lane is Gemini Flash: no card, ~1,500 requests a day, good tool calling.
 * An Anthropic key — the user's or ours — upgrades routing and scriptwriting.
 */
export const MODELS = {
  googleChat: process.env.GOOGLE_CHAT_MODEL ?? "gemini-3.5-flash",
  googleScript: process.env.GOOGLE_SCRIPT_MODEL ?? "gemini-3.5-flash",
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
