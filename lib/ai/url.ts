/** Accept "calai.app", "www.calai.app", "https://calai.app/pricing" alike. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  // A hostname with no dot is a typo or a local name, not a product site.
  if (!url.hostname.includes(".")) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // The last label has to look like a real TLD. Without this, "version 2.0"
  // parses cleanly as the host "2.0" and would be fetched as a product site.
  const tld = url.hostname.split(".").pop() ?? "";
  if (!/^[a-z]{2,}$/i.test(tld)) return null;

  return url.toString();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
