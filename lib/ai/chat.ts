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

import { putJob } from "@/lib/jobs/store";
import { runBriefPipeline } from "@/lib/pipeline/run";
import { runRenderJob } from "@/lib/pipeline/render-job";
import type { ResolvedKeys } from "@/lib/providers/keys";
import type { ChatMessage } from "./chat-message";
import { describeError } from "./errors";
import { CHAT_INSTRUCTIONS } from "./prompts";
import { initialStages, type JobData } from "./types";
import { hostOf, normalizeUrl } from "./url";

/**
 * M2: the pipeline reads the site and writes a brief and a script, streaming each
 * into the thread as it lands. Assets (M3) and the renderer (M4) are not built,
 * so nothing produces a video yet. Everything the model is told below is
 * deliberately truthful — it must never claim a video exists.
 */

export type ChatStreamOptions = {
  model: LanguageModel;
  messages: UIMessage[];
  /** Redacts provider keys out of anything surfaced to the client. */
  sanitizeError?: (message: string) => string;
  /** Off in unit tests, so routing can be checked without network or model calls. */
  runPipeline?: boolean;
  /** Provider keys for the asset stage. Absent keys degrade, they do not fail. */
  keys?: ResolvedKeys;
  /** Brief and script generation model; separate from the chat model on purpose. */
  scriptModel?: LanguageModel;
};

export function createChatStream({
  model,
  messages,
  sanitizeError = (message) => message,
  runPipeline = true,
  keys,
  scriptModel,
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
                status: "running",
                stages: initialStages(),
              };

              // A data part, not text — so the same id can be rewritten as the
              // pipeline advances, updating the card in place.
              writer.write({ type: "data-job", id: jobId, data: job });

              if (!runPipeline) {
                return {
                  accepted: true,
                  jobId,
                  url: normalized,
                  status: "queued",
                  note: "Pipeline disabled in this environment.",
                };
              }

              const { job: finished, site } = await runBriefPipeline({
                job,
                model: scriptModel ?? model,
                angle,
                onUpdate: (update) =>
                  writer.write({ type: "data-job", id: jobId, data: update }),
              });

              if (finished.status === "failed") {
                return {
                  accepted: false,
                  jobId,
                  reason: finished.error,
                  note: "Relay this to the user in one short sentence. Do not retry the tool.",
                };
              }

              // Rendering takes minutes, far longer than this turn may stay
              // open, so it runs detached and reports into the job store for the
              // card to poll. Deliberately not awaited.
              putJob(finished);
              if (site && keys) {
                void runRenderJob({ job: finished, keys, site });
              }

              return {
                accepted: true,
                jobId,
                url: normalized,
                product: finished.brief?.name,
                oneLiner: finished.brief?.oneLiner,
                scenes: finished.script?.scenes.length,
                durationSec: finished.script?.totalDurationSec,
                note: "The brief and script are already shown to the user in the job card, which now renders the video and updates itself — do not repeat them and do not list the scenes. Say in one short sentence that the script is ready and the video is rendering. Do NOT claim the video is finished and never invent a URL.",
              };
            },
          }),
        },
      });

      // toUIMessageStream masks errors before they ever reach the outer handler,
      // so the explanation has to be attached here too.
      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          sendStart: false,
          onError: (error) => sanitizeError(describeError(error)),
        }),
      );
    },
    onError: (error) => sanitizeError(describeError(error)),
  });
}
