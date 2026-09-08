"use client";

const EXAMPLES = [
  "I'm building CalAI, a calorie-tracking app. Here's the site: calai.app",
  "What can you do?",
  "make me a video for linear.app",
];

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="animate-in-up py-20">
      <h1 className="text-[15px] font-medium text-ink">UGC8X</h1>
      <p className="mt-1 max-w-sm text-[14px] leading-6 text-muted">
        Send me a product URL and I&apos;ll make a short UGC-style marketing video.
        Or just talk to me.
      </p>
      <div className="mt-6 flex flex-col items-start gap-1.5">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="max-w-full truncate rounded-lg border border-line px-2.5 py-1.5 text-left text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
