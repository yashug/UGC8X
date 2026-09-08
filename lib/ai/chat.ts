import {
  convertToModelMessages,
  createUIMessageStream,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { z } from "zod";

import { runVideoPipeline } from "@/lib/pipeline/run";
import { resolveKeys, type ResolvedKeys } from "@/lib/providers/keys";
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

function lastUserMessageText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((message) => message.role === "user");
  if (!last) return "";
  return last.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join(" ");
}

export type ChatStreamOptions = {
  model: LanguageModel;
  messages: UIMessage[];
  /** Redacts provider keys out of anything surfaced to the client. */
  sanitizeError?: (message: string) => string;
  /** Off in unit tests, so routing can be checked without network or model calls. */
  runPipeline?: boolean;
  /** Provider keys for the asset stage. Absent keys degrade, they do not fail. */
  keys?: ResolvedKeys;
  /** Brief and script models, best first; separate from the chat model on purpose. */
  scriptModels?: LanguageModel[];
};


type StartJobOptions = {
  writer: UIMessageStreamWriter<ChatMessage>;
  models: LanguageModel[];
  keys?: ResolvedKeys;
  runPipeline: boolean;
  url: string;
  productName?: string;
  angle?: string;
};

/**
 * Opens a render job and streams its card. Shared by the tool and by the guard
 * below, so there is exactly one path that can start a render.
 */
async function startVideoJob({
  writer,
  models,
  keys,
  runPipeline,
  url,
  productName,
  angle,
}: StartJobOptions) {
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

  // A data part, not text — so the same id can be rewritten as the pipeline
  // advances, updating the card in place.
  writer.write({ type: "data-job", id: jobId, data: job });

  if (!runPipeline) {
    return { accepted: true, jobId, url: normalized, status: "queued", note: "Pipeline disabled in this environment." };
  }

  const { job: finished } = await runVideoPipeline({
    job,
    models,
    angle,
    keys: keys ?? resolveKeys(),
    onUpdate: (update) => writer.write({ type: "data-job", id: jobId, data: update }),
  });

  if (finished.status === "failed") {
    return {
      accepted: false,
      jobId,
      reason: finished.error,
      note: "Relay this to the user in one short sentence. Do not retry the tool.",
    };
  }

  return {
    accepted: true,
    jobId,
    url: normalized,
    product: finished.brief?.name,
    oneLiner: finished.brief?.oneLiner,
    scenes: finished.script?.scenes.length,
    durationSec: finished.script?.totalDurationSec,
    note: "The video is finished and already playing in the job card above, along with the brief and script — do not repeat them and do not list the scenes. Say one short sentence, e.g. that the video is ready to watch. There is no URL and no file: it plays right there in the chat. Never invent a link.",
  };
}

/**
 * Catches the model claiming to act without acting.
 *
 * Tool calling is not perfectly reliable: on one run the model replied "Working on
 * that for you!" to a message containing a URL and never called the tool, leaving
 * the user waiting for a video that was never going to arrive. That specific
 * contradiction — a promise of a video, no tool call, and a URL sitting right
 * there in the message — is detectable, so it is repaired rather than shipped.
 *
 * This is not a classifier reinstated by the back door: it never decides that an
 * ordinary message should render. It only fires when the model has already said
 * it is doing the thing.
 */
const CLAIMED_ACTION =
  /\b(on it|working on|generating|creating|making|i'?ll (make|create|generate)|let me (make|create|generate)|get(ting)? (that|it) (made|going))\b/i;

export function findRenderPromise(
  assistantText: string,
  lastUserText: string,
): string | null {
  if (!CLAIMED_ACTION.test(assistantText)) return null;

  const candidate = lastUserText.match(
    /\b((?:https?:\/\/)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?)/i,
  )?.[1];

  return candidate && normalizeUrl(candidate) ? candidate : null;
}

export function createChatStream({
  model,
  messages,
  sanitizeError = (message) => message,
  runPipeline = true,
  keys,
  scriptModels,
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
            execute: async ({ url, productName, angle }) =>
              startVideoJob({
                writer,
                models: scriptModels ?? [model],
                keys,
                runPipeline,
                url,
                productName,
                angle,
              }),
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

      const [toolCalls, assistantText] = await Promise.all([result.toolCalls, result.text]);

      if (toolCalls.length === 0) {
        const lastUserText = lastUserMessageText(messages);
        const promised = findRenderPromise(assistantText, lastUserText);

        if (promised) {
          await startVideoJob({
            writer,
            models: scriptModels ?? [model],
            keys,
            runPipeline,
            url: promised,
          });
        }
      }
    },
    onError: (error) => sanitizeError(describeError(error)),
  });
}
