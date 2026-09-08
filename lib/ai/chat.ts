import {
  convertToModelMessages,
  createUIMessageStream,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";

import type { ChatMessage } from "./chat-message";
import { CHAT_INSTRUCTIONS } from "./prompts";
import { initialStages, type JobData } from "./types";
import { hostOf, normalizeUrl } from "./url";

/**
 * M1: the tool accepts a job and streams a card, but nothing renders yet.
 * Assets land in M3 and the GitHub Actions renderer in M4. Everything the model
 * is told below is deliberately truthful — it must never claim a video exists.
 * Flip this constant when the pipeline is connected.
 */
export const RENDER_PIPELINE_CONNECTED = false;

export type ChatStreamOptions = {
  model: LanguageModel;
  messages: UIMessage[];
  /** Redacts provider keys out of anything surfaced to the client. */
  sanitizeError?: (message: string) => string;
};

export function createChatStream({
  model,
  messages,
  sanitizeError = (message) => message,
}: ChatStreamOptions) {
  return createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      const result = streamText({
        model,
        instructions: CHAT_INSTRUCTIONS,
        messages: await convertToModelMessages(messages),
        stopWhen: isStepCount(3),
        tools: {
          generate_ugc_video: tool({
            description:
              "Generate a short UGC-style marketing video for a product. Call only when the user has given a product AND a URL for it.",
            inputSchema: z.object({
              url: z
                .string()
                .describe("The product's website. Bare domains are fine, e.g. calai.app"),
              productName: z
                .string()
                .optional()
                .describe("The product name, if the user stated one"),
              angle: z
                .string()
                .optional()
                .describe("Any angle or tone the user asked for"),
            }),
            execute: async ({ url, productName, angle }) => {
              const normalized = normalizeUrl(url);

              if (!normalized) {
                return {
                  accepted: false,
                  reason: `"${url}" is not a URL I can read. Ask the user for the product's website.`,
                };
              }

              const jobId = crypto.randomUUID();
              const job: JobData = {
                jobId,
                url: normalized,
                productName: productName ?? hostOf(normalized),
                status: RENDER_PIPELINE_CONNECTED ? "running" : "queued",
                stages: initialStages(),
                notImplemented: !RENDER_PIPELINE_CONNECTED,
              };

              // A data part, not text — so the same id can be rewritten later to
              // update the card in place as real stages complete.
              writer.write({ type: "data-job", id: jobId, data: job });

              if (!RENDER_PIPELINE_CONNECTED) {
                return {
                  accepted: true,
                  jobId,
                  url: normalized,
                  status: "queued",
                  note: "The render pipeline is not connected yet, so no video will be produced. Tell the user the job was accepted but rendering is not wired up yet. Do NOT claim a video exists or invent a URL.",
                };
              }

              return { accepted: true, jobId, url: normalized, status: "running", angle };
            },
          }),
        },
      });

      writer.merge(toUIMessageStream({ stream: result.stream, sendStart: false }));
    },
    onError: (error) =>
      sanitizeError(error instanceof Error ? error.message : String(error)),
  });
}
