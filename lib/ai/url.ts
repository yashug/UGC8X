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

  return url.toString();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
