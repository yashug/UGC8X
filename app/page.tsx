"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

import { Composer } from "@/components/chat/composer";
import {
  SettingsSheet,
  fetchCapabilities,
  type Row as CapabilityRow,
} from "@/components/settings/settings-sheet";
import { EmptyState } from "@/components/chat/empty-state";
import { JobCard } from "@/components/chat/job-card";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ChatMessage } from "@/lib/ai/chat-message";
import { USER_KEYS_HEADER } from "@/lib/providers/keys";

const KEYS_STORAGE = "ugc8x-keys";

export default function Page() {
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilityRow[] | null>(null);

  // Opening is the event that loads the data, so the sheet needs no effect.
  function openSettings() {
    setSettingsOpen(true);
    setCapabilities(null);
    void fetchCapabilities().then(setCapabilities);
  }
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
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={openSettings}
            aria-label="Your API keys"
            className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-sunk hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.5a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </svg>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {settingsOpen ? (
        <SettingsSheet
          rows={capabilities}
          onRowsChange={setCapabilities}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

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
            Runs on a shared free-tier key.{" "}
            <button
              type="button"
              onClick={openSettings}
              className="underline underline-offset-2 hover:text-muted"
            >
              Add your own
            </button>{" "}
            for better output.
          </p>
        </div>
      </div>
    </div>
  );
}
