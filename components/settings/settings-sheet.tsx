"use client";

import { useEffect, useState } from "react";
import type { Capability } from "@/lib/providers/capabilities";

export type Row = Capability & {
  source: "user" | "server" | "none";
  mask: string | null;
};

/** Shared by the sheet and by whoever opens it, so the fetch can live in the click. */
export async function fetchCapabilities(): Promise<Row[]> {
  try {
    const response = await fetch("/api/keys", { cache: "no-store" });
    if (!response.ok) return [];
    return (await response.json()).capabilities as Row[];
  } catch {
    return [];
  }
}

const SOURCE_LABEL: Record<Row["source"], string> = {
  user: "your key",
  server: "shared key",
  none: "not available",
};

function SourceTag({ source }: { source: Row["source"] }) {
  const tone =
    source === "user"
      ? "border-ok/40 text-ok"
      : source === "server"
        ? "border-line text-muted"
        : "border-line text-faint";

  return (
    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] ${tone}`}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

function CapabilityRow({
  row,
  onSaved,
}: {
  row: Row;
  onSaved: (rows: Row[]) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: row.provider, key: value.trim() }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "That key was not accepted.");
        return;
      }
      setValue("");
      setNote(body.note ?? null);
      onSaved(body.capabilities);
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const response = await fetch(`/api/keys?provider=${row.provider}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (response.ok) onSaved(body.capabilities);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-line py-3.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-ink">{row.label}</p>
        <SourceTag source={row.source} />
      </div>

      <p className="mt-1 text-[12px] leading-5 text-muted">
        {row.source === "user" ? (
          <>Using your key — {row.upgrade}.</>
        ) : (
          <>
            Now: {row.free}. Add a key for {row.upgrade}.
          </>
        )}
      </p>

      {row.source === "user" ? (
        <div className="mt-2 flex items-center gap-2">
          <code className="rounded-md border border-line bg-sunk px-2 py-1 font-mono text-[11px] text-muted">
            {row.mask}
          </code>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-[12px] text-faint underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="mt-2 flex gap-1.5">
          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
            placeholder="Paste key"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy || !value.trim()}
            className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-bg disabled:opacity-25"
          >
            {busy ? "Checking" : "Save"}
          </button>
        </div>
      )}

      {error ? <p className="mt-1.5 text-[12px] text-danger">{error}</p> : null}
      {note ? <p className="mt-1.5 text-[12px] text-faint">{note}</p> : null}

      <a
        href={row.help}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-1.5 inline-block text-[11px] text-faint underline-offset-2 hover:text-muted hover:underline"
      >
        Get a key
      </a>
    </div>
  );
}

/**
 * Presentational on purpose. The initial fetch happens in the click that opens
 * the sheet rather than in an effect here, so opening is the event that loads
 * the data instead of the render reacting to itself.
 */
export function SettingsSheet({
  rows,
  onRowsChange,
  onClose,
}: {
  rows: Row[] | null;
  onRowsChange: (rows: Row[]) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/25"
      />

      <aside className="animate-in-up relative flex h-full w-full max-w-[26rem] flex-col overflow-y-auto border-l border-line bg-bg">
        <header className="flex items-baseline justify-between px-5 py-4">
          <h2 className="text-[13px] font-medium text-ink">Your keys</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] text-faint hover:text-ink"
          >
            Close
          </button>
        </header>

        <p className="px-5 pb-3 text-[12px] leading-5 text-muted">
          Bring your own keys for better output. Each one upgrades a single part of
          the pipeline — everything else keeps working as it is. Keys are encrypted,
          scoped to this browser, expire after a day, and are never shown back to
          you in full.
        </p>

        <div className="px-5 pb-8">
          {rows === null ? (
            <p className="py-6 text-[12px] text-faint">Loading…</p>
          ) : (
            rows.map((row) => (
              <CapabilityRow key={row.provider} row={row} onSaved={onRowsChange} />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
