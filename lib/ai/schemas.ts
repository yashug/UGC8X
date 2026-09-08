import { z } from "zod";

export const productBriefSchema = z.object({
  name: z.string().describe("The product name as its own site presents it"),
  oneLiner: z.string().describe("What it does, in one plain sentence, no hype"),
  category: z.string().describe("e.g. calorie-tracking app, issue tracker"),
  audience: z.string().describe("Who it is for, concretely"),
  painPoints: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("What is annoying about life without it"),
  benefits: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("What changes once someone uses it"),
  proofPoints: z
    .array(z.string())
    .max(3)
    .describe("Real numbers or claims found on the page, e.g. '5M users', '4.9 rating'. Empty if the page states none."),
  cta: z.string().describe("What the ad should ask the viewer to do"),
});

export const videoSceneSchema = z.object({
  durationSec: z.number().min(2).max(8),
  voiceover: z.string().describe("Spoken aloud. One or two sentences, conversational."),
  onScreenText: z.string().describe("Short caption burned onto the screen. Max ~6 words."),
  visual: z
    .string()
    .describe("What is on screen, described concretely enough to source footage for"),
});

export const videoScriptSchema = z.object({
  // No separate hook field: scene 1 *is* the hook, and asking for both only got
  // back the same sentence twice.
  scenes: z.array(videoSceneSchema).min(3).max(6),
});

export type ProductBriefOutput = z.infer<typeof productBriefSchema>;
export type VideoScriptOutput = z.infer<typeof videoScriptSchema>;
