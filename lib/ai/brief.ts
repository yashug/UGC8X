import { Output, generateText, type LanguageModel } from "ai";

import type { SiteExtract } from "@/lib/product/extract";
import { productBriefSchema } from "./schemas";
import type { ProductBrief } from "./types";

const INSTRUCTIONS = `
You read a product's landing page and work out what the product actually is.

Rules that matter:
- The meta description is frequently useless filler ("Download Today"). The real
  positioning is almost always in the H1 and the first headings. Trust those.
- Proof points must be copied from the page, never invented. If the page claims no
  numbers, return an empty list. A fabricated statistic ruins the ad.
- Pain points are what life is like WITHOUT the product, in the user's words, not
  marketing abstractions. "Logging every meal by hand is tedious", not "inefficiency".
- Keep every line short enough to be spoken aloud.
`.trim();

export async function generateBrief(
  model: LanguageModel,
  site: SiteExtract,
): Promise<ProductBrief> {
  const { output } = await generateText({
    model,
    instructions: INSTRUCTIONS,
    output: Output.object({ schema: productBriefSchema }),
    prompt: [
      `URL: ${site.url}`,
      `Title: ${site.title}`,
      `Description: ${site.description || "(none)"}`,
      site.appStoreLinks.length ? `App store: ${site.appStoreLinks.join(", ")}` : "",
      "",
      "Headings:",
      site.headings.map((heading) => `- ${heading}`).join("\n") || "(none)",
      "",
      "Page text:",
      site.text.slice(0, 6000),
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return {
    ...output,
    palette: site.themeColor ? [site.themeColor] : undefined,
  };
}
