/**
 * Pulls the useful parts out of a landing page.
 *
 * Deliberately dependency-free: a real product page exposes almost everything we
 * need in its metadata and headings, and this runs on every render. If pages with
 * unusual markup start slipping through, swap the internals for a parser — the
 * shape of SiteExtract is the contract, not the regexes.
 */

export type SiteImage = {
  url: string;
  alt: string;
};

export type SiteExtract = {
  url: string;
  title: string;
  description: string;
  ogImage?: string;
  headings: string[];
  text: string;
  images: SiteImage[];
  themeColor?: string;
  appStoreLinks: string[];
  /** True when the page rendered almost no text, i.e. a JS-only shell. */
  isThin: boolean;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#x27": "'",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name: string) => {
    const key = name.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function meta(html: string, key: string): string | undefined {
  // Attribute order varies, so match the tag then read the content out of it.
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`,
    "i",
  );
  const tag = html.match(pattern)?.[0];
  if (!tag) return undefined;
  const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
  const value = content ? collapse(decodeEntities(content)) : "";
  return value || undefined;
}

function absolute(candidate: string, base: string): string | undefined {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return undefined;
  }
}

export function extractSite(html: string, url: string): SiteExtract {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title =
    meta(html, "og:title") ??
    (titleTag ? collapse(decodeEntities(titleTag)) : "") ??
    "";

  const description =
    meta(html, "og:description") ?? meta(html, "description") ?? "";

  const ogImageRaw = meta(html, "og:image");
  const ogImage = ogImageRaw ? absolute(ogImageRaw, url) : undefined;

  const headings = Array.from(
    withoutNoise.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi),
  )
    .map((match) => collapse(decodeEntities(stripTags(match[1]))))
    .filter((heading) => heading.length > 1 && heading.length < 200)
    .slice(0, 30);

  const text = collapse(decodeEntities(stripTags(withoutNoise))).slice(0, 12_000);

  const images: SiteImage[] = [];
  const seen = new Set<string>();
  for (const match of withoutNoise.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src =
      tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || src.startsWith("data:")) continue;
    const resolved = absolute(src, url);
    // Sprites and tracking pixels are never product shots.
    if (!resolved || seen.has(resolved) || /sprite|pixel|analytics/i.test(resolved)) continue;
    seen.add(resolved);
    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    images.push({ url: resolved, alt: collapse(decodeEntities(alt)) });
    if (images.length >= 24) break;
  }

  const appStoreLinks = Array.from(
    html.matchAll(/https?:\/\/(?:apps\.apple\.com|play\.google\.com)\/[^"'\s<>]+/gi),
  )
    .map((match) => match[0])
    .filter((link, index, all) => all.indexOf(link) === index)
    .slice(0, 4);

  return {
    url,
    title,
    description,
    ogImage,
    headings,
    text,
    images,
    themeColor: meta(html, "theme-color"),
    appStoreLinks,
    // Below this, the page is a JS shell and the model has nothing to read.
    isThin: text.length < 400,
  };
}
