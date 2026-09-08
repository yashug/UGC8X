import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetching a URL the user supplied means the server will connect wherever it is
 * told to. That is a server-side request forgery hole unless the destination is
 * checked, so every hop is resolved and screened before it is followed.
 */

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0 Safari/537.36 UGC8X/1.0";

export class UnreachableSiteError extends Error {
  constructor(
    message: string,
    readonly kind: "blocked" | "dns" | "http" | "timeout" | "empty",
  ) {
    super(message);
    this.name = "UnreachableSiteError";
  }
}

/** Ranges that must never be reachable from a user-supplied URL. */
export function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const ip = address.toLowerCase();
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fe80") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
    // IPv4-mapped IPv6, e.g. ::ffff:169.254.169.254
    const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnreachableSiteError(`${hostname} is not a public address.`, "blocked");
    }
    return;
  }

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new UnreachableSiteError(`Couldn't resolve ${hostname}.`, "dns");
  }

  if (addresses.length === 0) {
    throw new UnreachableSiteError(`Couldn't resolve ${hostname}.`, "dns");
  }
  // If any resolved address is private, refuse the whole host rather than
  // racing DNS to pick a "safe" one.
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new UnreachableSiteError(`${hostname} resolves to a private address.`, "blocked");
  }
}

export type FetchedSite = {
  html: string;
  finalUrl: string;
};

export async function fetchSite(url: string): Promise<FetchedSite> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = new URL(current);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new UnreachableSiteError(`${target.protocol} is not a fetchable scheme.`, "blocked");
    }

    // Screened on every hop: a public URL can redirect to a private one.
    await assertPublicHost(target.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(target, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === "AbortError") {
        throw new UnreachableSiteError(`${target.hostname} took too long to respond.`, "timeout");
      }
      throw new UnreachableSiteError(`Couldn't reach ${target.hostname}.`, "dns");
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UnreachableSiteError(`${target.hostname} redirected nowhere.`, "http");
      }
      current = new URL(location, target).toString();
      continue;
    }

    if (!response.ok) {
      throw new UnreachableSiteError(
        `${target.hostname} returned ${response.status}.`,
        "http",
      );
    }

    const html = await readCapped(response);
    if (!html.trim()) {
      throw new UnreachableSiteError(`${target.hostname} returned an empty page.`, "empty");
    }

    return { html, finalUrl: target.toString() };
  }

  throw new UnreachableSiteError("Too many redirects.", "http");
}

/** Stop reading a hostile or enormous response rather than buffering it all. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    chunks.push(decoder.decode(value, { stream: true }));
    if (size >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }

  return chunks.join("");
}
