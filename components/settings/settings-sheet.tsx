"use client";

import { useEffect, useState } from "react";
import type { Capability } from "@/lib/providers/capabilities";
import { maskKey, type ProviderName } from "@/lib/providers/keys";

/**
 * Keys live in this browser and nowhere else.
 *
 * They are sent with each chat request and used for the length of that request.
 * The server stores nothing, which is both simpler than the encrypted
 * session store this replaced and strictly more private.
 */
export const KEYS_STORAGE = "ugc8x-keys";

export type Row = Capability & { serverHasKey: boolean };

export type StoredKeys = Partial<Record<ProviderName, string>>;

export function readStoredKeys(): StoredKeys {
  try {
    const raw = localStorage.getItem(KEYS_STORAGE);
    return raw ? (JSON.parse(raw) as StoredKeys) : {};
  } catch {
    return {};
  }
}

function writeStoredKeys(keys: StoredKeys): void {
  try {
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
  } catch {
    // Private browsing. The key still works for this page's lifetime.
  }
}

export async function fetchCapabilities(): Promise<Row[]> {
  try {
    const response = await fetch("/api/keys", { cache: "no-store" });
    if (!response.ok) return [];
    return (await response.json()).capabilities as Row[];
  } catch {
    return [];
  }
}

type Source = "user" | "server" | "none";

const SOURCE_LABEL: Record<Source, string> = {
  user: "your key",
  server: "shared key",
  none: "not available",
};

function SourceTag({ source }: { source: Source }) {
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
  stored,
  onChange,
}: {
  row: Row;
  stored: StoredKeys;
  onChange: (keys: StoredKeys) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const mine = stored[row.provider];
  const source: Source = mine ? "user" : row.serverHasKey ? "server" : "none";

  async function save() {
    const key = value.trim();
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: row.provider, key }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "That key was not accepted.");
        return;
      }
      // Only the browser ever holds it.
      const next = { ...stored, [row.provider]: key };
      writeStoredKeys(next);
      onChange(next);
      setValue("");
      setNote(body.note ?? null);
    } catch {
      setError("Couldn't check that key. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    const next = { ...stored };
    delete next[row.provider];
    writeStoredKeys(next);
    onChange(next);
    setNote(null);
  }

  return (
    <div className="border-t border-line py-3.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-ink">{row.label}</p>
        <SourceTag source={source} />
      </div>

      <p className="mt-1 text-[12px] leading-5 text-muted">
        {source === "user" ? (
          <>Using your key — {row.upgrade}.</>
        ) : (
          <>
            Now: {row.free}. Add a key for {row.upgrade}.
          </>
        )}
      </p>

      {mine ? (
        <div className="mt-2 flex items-center gap-2">
          <code className="rounded-md border border-line bg-sunk px-2 py-1 font-mono text-[11px] text-muted">
            {maskKey(mine)}
          </code>
          <button
            type="button"
            onClick={remove}
            className="text-[12px] text-faint underline-offset-2 hover:text-danger hover:underline"
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

export function SettingsSheet({
  rows,
  stored,
  onStoredChange,
  onClose,
}: {
  rows: Row[] | null;
  stored: StoredKeys;
  onStoredChange: (keys: StoredKeys) => void;
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
          the pipeline and leaves the rest alone. Keys are kept in this browser and
          sent with your requests — the server never stores them.
        </p>

        <div className="px-5 pb-8">
          {rows === null ? (
            <p className="py-6 text-[12px] text-faint">Loading…</p>
          ) : (
            rows.map((row) => (
              <CapabilityRow
                key={row.provider}
                row={row}
                stored={stored}
                onChange={onStoredChange}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
