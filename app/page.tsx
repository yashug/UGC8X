"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

import { Composer } from "@/components/chat/composer";
import { EmptyState } from "@/components/chat/empty-state";
import { JobCard } from "@/components/chat/job-card";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ChatMessage } from "@/lib/ai/chat-message";
import { USER_KEYS_HEADER } from "@/lib/providers/keys";

const KEYS_STORAGE = "ugc8x-keys";

export default function Page() {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        // BYOK: keys live in the browser and ride along per request.
        // They are never persisted server-side at this milestone.
        headers: (): Record<string, string> => {
          try {
            const stored = localStorage.getItem(KEYS_STORAGE);
            return stored ? { [USER_KEYS_HEADER]: stored } : {};
          } catch {
            return {};
          }
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat<ChatMessage>({ transport });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput("");
    void sendMessage({ text: trimmed });
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="font-mono text-[13px] font-medium tracking-tight text-ink">
          UGC8X
        </span>
        <ThemeToggle />
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[46rem] px-4">
          {messages.length === 0 ? <EmptyState onPick={send} /> : null}

          <div className="flex flex-col gap-6 py-4">
            {messages.map((message) => (
              <div key={message.id}>
                {message.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-sunk px-3.5 py-2 text-[14px] leading-6 text-ink">
                      {message.parts
                        .filter((part) => part.type === "text")
                        .map((part) => part.text)
                        .join("")}
                    </div>
                  </div>
                ) : (
                  <div className="prose-thread flex flex-col gap-3 text-[14px] leading-6 text-ink">
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return (
                          <p key={index} className="whitespace-pre-wrap">
                            {part.text}
                          </p>
                        );
                      }
                      if (part.type === "data-job") {
                        return <JobCard key={index} job={part.data} />;
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            ))}

            {busy &&
            messages[messages.length - 1]?.role === "user" ? (
              <span className="animate-pulse-dot block size-1.5 rounded-full bg-faint" />
            ) : null}

            {error ? (
              <p className="text-[13px] text-danger">
                {error.message || "Something went wrong."}
              </p>
            ) : null}
          </div>

          <div ref={bottomRef} />
        </div>
      </main>

      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto w-full max-w-[46rem]">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => send(input)}
            disabled={busy}
            busy={busy}
          />
          <p className="mt-2 text-center text-[11px] text-faint">
            Free lane runs on Gemini Flash. Add your own keys for better output.
          </p>
        </div>
      </div>
    </div>
  );
}
