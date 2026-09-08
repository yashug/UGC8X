import type { ProviderName } from "./keys";

/**
 * What a key actually buys you.
 *
 * The settings sheet is not a list of API keys, it is a list of capabilities and
 * their current source. That framing is the whole point of the BYOK design: keys
 * upgrade one capability each, independently, rather than flipping a global tier.
 */
export type Capability = {
  provider: ProviderName;
  label: string;
  /** What happens with no user key. */
  free: string;
  /** What this key changes, in plain terms. */
  upgrade: string;
  /** Whether the app is usable at all without it. */
  essential: boolean;
  help: string;
};

export const CAPABILITIES: Capability[] = [
  {
    provider: "google",
    label: "Conversation and script",
    free: "our shared key, subject to a daily free-tier limit",
    upgrade: "your own quota, so you never wait on someone else's",
    essential: true,
    help: "https://aistudio.google.com/apikey",
  },
  {
    provider: "pexels",
    label: "Hook footage",
    free: "our shared key",
    upgrade: "your own quota for stock creator clips",
    essential: false,
    help: "https://www.pexels.com/api/",
  },
  {
    provider: "anthropic",
    label: "Script quality",
    free: "Gemini Flash",
    upgrade: "Claude, which writes noticeably better ad copy",
    essential: false,
    help: "https://console.anthropic.com/settings/keys",
  },
  {
    provider: "elevenlabs",
    label: "Voiceover",
    free: "Gemini TTS, one voice",
    upgrade: "natural voices, and word timings for karaoke captions",
    essential: false,
    help: "https://elevenlabs.io/app/settings/api-keys",
  },
  {
    provider: "fal",
    label: "Hook clip",
    free: "Pexels stock footage of a real person",
    upgrade: "an AI-generated creator clip, made for your product",
    essential: false,
    help: "https://fal.ai/dashboard/keys",
  },
];
