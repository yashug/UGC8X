import { Output, generateText, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * Runs a structured generation against the first model that will accept it.
 *
 * Google meters its free tier per model, and the limits are small: a single video
 * costs several calls, so a shared key runs dry partway through and the user gets
 * an error at the least useful moment. Trying the next model on a quota failure
 * draws from a separate bucket and keeps the free lane usable — the same trick
 * that stopped voiceovers going silent.
 *
 * Only quota failures fall through. A malformed prompt or a bad key should not be
 * retried against four models in turn.
 */
export async function generateObjectWithFallback<T extends z.ZodType>({
  models,
  schema,
  instructions,
  prompt,
}: {
  models: LanguageModel[];
  schema: T;
  instructions: string;
  prompt: string;
}): Promise<z.infer<T>> {
  let lastError: unknown;

  for (const model of models) {
    try {
      const { output } = await generateText({
        model,
        instructions,
        output: Output.object({ schema }),
        prompt,
      });
      return output as z.infer<T>;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/quota|rate.?limit|429/i.test(message)) throw error;
      console.warn(
        `[ugc8x] model exhausted, trying the next one: ${message.slice(0, 120)}`,
      );
    }
  }

  throw lastError ?? new Error("No model was able to answer.");
}
