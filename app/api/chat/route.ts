import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";

import type { ChatMessage } from "@/lib/ai/chat-message";
import { createChatStream } from "@/lib/ai/chat";
import { NO_KEY_MESSAGE } from "@/lib/ai/prompts";
import { readUserKeys, redact, resolveKeys } from "@/lib/providers/keys";
import { chatModel, scriptModel, NoLlmKeyError } from "@/lib/providers/llm";

/**
 * The whole pipeline — read the site, write the brief and script, generate the
 * voiceover — runs inside this request, so it needs the longest window the plan
 * allows. 60s is the Vercel Hobby ceiling; Pro with fluid compute allows more,
 * which is worth setting if renders start timing out.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as { messages: UIMessage[] };

  // The browser holds its own keys and sends them with the request. Nothing runs
  // after the response, so nothing needs them for longer than this.
  const resolved = resolveKeys(readUserKeys(req));

  let llm;
  try {
    llm = chatModel(resolved);
  } catch (error) {
    if (!(error instanceof NoLlmKeyError)) throw error;
    // Not an error state worth throwing: the app is simply unconfigured, and the
    // user is told exactly which free key to add.
    return createUIMessageStreamResponse({
      stream: createUIMessageStream<ChatMessage>({
        execute: ({ writer }) => {
          writer.write({ type: "start" });
          writer.write({ type: "text-start", id: "no-key" });
          writer.write({ type: "text-delta", id: "no-key", delta: NO_KEY_MESSAGE });
          writer.write({ type: "text-end", id: "no-key" });
        },
      }),
    });
  }

  return createUIMessageStreamResponse({
    stream: createChatStream({
      model: llm.model,
      messages: body.messages,
      keys: resolved,
      scriptModel: scriptModel(resolved).model,
      sanitizeError: (message) => redact(message, resolved.keys),
    }),
  });
}
