import { describe, expect, it } from "vitest";
import { MockLanguageModelV4, convertArrayToReadableStream, convertReadableStreamToArray } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { UIMessage } from "ai";

import { createChatStream } from "@/lib/ai/chat";
import type { JobData } from "@/lib/ai/types";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** Provider spec v4 carries a finish reason object, not a bare string. */
function finish(
  unified: "stop" | "tool-calls" = "stop",
): LanguageModelV4StreamPart {
  return { type: "finish", usage, finishReason: { unified, raw: unified } };
}

function textParts(text: string): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    finish(),
  ];
}

function toolCallParts(input: Record<string, unknown>): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "generate_ugc_video",
      input: JSON.stringify(input),
    },
    finish("tool-calls"),
  ];
}

/** Answers with `first` on the opening step, then plain text on any follow-up step. */
function mockModel(first: LanguageModelV4StreamPart[]) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const parts = call++ === 0 ? first : textParts("Done.");
      return { stream: convertArrayToReadableStream(parts) };
    },
  });
}

function userMessage(text: string): UIMessage[] {
  return [{ id: "u1", role: "user", parts: [{ type: "text", text }] }];
}

async function runChat(first: LanguageModelV4StreamPart[], text: string) {
  const stream = createChatStream({ model: mockModel(first), messages: userMessage(text) });
  return convertReadableStreamToArray(stream);
}

function jobParts(chunks: Array<Record<string, unknown>>): JobData[] {
  return chunks
    .filter((chunk) => chunk.type === "data-job")
    .map((chunk) => chunk.data as JobData);
}

describe("chat routing", () => {
  it("emits a job card when the model calls the tool with a product URL", async () => {
    const chunks = await runChat(
      toolCallParts({ url: "calai.app", productName: "CalAI" }),
      "I'm building CalAI, a calorie-tracking app. Here's the site: calai.app",
    );

    const jobs = jobParts(chunks);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].url).toBe("https://calai.app/");
    expect(jobs[0].productName).toBe("CalAI");
    expect(jobs[0].stages).toHaveLength(7);
    expect(jobs[0].stages.every((stage) => stage.status === "pending")).toBe(true);
  });

  it("emits no job card for ordinary conversation", async () => {
    const chunks = await runChat(textParts("Hey! What are you working on?"), "hi");
    expect(jobParts(chunks)).toHaveLength(0);
  });

  it("refuses to open a job for an unusable URL", async () => {
    const chunks = await runChat(toolCallParts({ url: "not a url" }), "make a video for not a url");
    expect(jobParts(chunks)).toHaveLength(0);
  });

  it("does not claim a video exists while the pipeline is unconnected", async () => {
    const chunks = await runChat(toolCallParts({ url: "calai.app" }), "calai.app");
    const [job] = jobParts(chunks);
    expect(job.videoUrl).toBeUndefined();
    expect(job.status).toBe("queued");
    expect(job.notImplemented).toBe(true);
  });
});
