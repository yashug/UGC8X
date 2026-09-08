import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";

import type { ChatMessage } from "@/lib/ai/chat-message";
import { createChatStream } from "@/lib/ai/chat";
import { NO_KEY_MESSAGE } from "@/lib/ai/prompts";
import { readUserKeys, redact, resolveKeys } from "@/lib/providers/keys";
import { chatModel, NoLlmKeyError } from "@/lib/providers/llm";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as { messages: UIMessage[] };
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
      sanitizeError: (message) => redact(message, resolved.keys),
    }),
  });
}
