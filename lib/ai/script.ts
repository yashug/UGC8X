import { Output, generateText, type LanguageModel } from "ai";

import { videoScriptSchema } from "./schemas";
import type { ProductBrief, VideoScript } from "./types";

const INSTRUCTIONS = `
You write short UGC-style ad scripts — the kind a real person films on their phone,
not a corporate promo.

Structure, roughly 25 seconds across 4 or 5 scenes:
1. Hook (2-3s). Scene 1 is the hook: a person talking straight to camera. It must
   earn the next second. Start mid-thought, like a real recommendation.
   No "Introducing…", and never lead with the brand name.
2. Problem (4-6s). The annoying thing, specific and recognisable.
3. Demo (6-10s, may be two scenes). The product doing the thing. Concrete.
4. Proof (3-5s). Only if the brief has real proof points. Skip it if not.
5. CTA (3-4s). Plain and direct.

Rules:
- Voiceover is spoken, so write how people talk. Contractions. No semicolons.
- onScreenText is a caption, not a repeat of the voiceover. Six words at most.
- visual must be concrete enough to source footage for: say what is on screen.
- Never invent a statistic, a price, or a feature that is not in the brief.
- Scene durations must add up to between 20 and 30 seconds.
`.trim();

export async function generateScript(
  model: LanguageModel,
  brief: ProductBrief,
  angle?: string,
): Promise<VideoScript> {
  const { output } = await generateText({
    model,
    instructions: INSTRUCTIONS,
    output: Output.object({ schema: videoScriptSchema }),
    prompt: [
      `Product: ${brief.name}`,
      `What it is: ${brief.oneLiner}`,
      `Category: ${brief.category ?? "unknown"}`,
      `Audience: ${brief.audience ?? "unknown"}`,
      `Pain points: ${brief.painPoints.join(" | ") || "(none given)"}`,
      `Benefits: ${brief.benefits.join(" | ") || "(none given)"}`,
      `Proof points: ${brief.proofPoints.join(" | ") || "(none — do not invent any)"}`,
      `Call to action: ${brief.cta}`,
      angle ? `The user asked for this angle: ${angle}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const scenes = output.scenes.map((scene, index) => ({ ...scene, index }));

  return {
    scenes,
    totalDurationSec: Math.round(
      scenes.reduce((total, scene) => total + scene.durationSec, 0),
    ),
  };
}
