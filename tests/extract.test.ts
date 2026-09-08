import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeEntities, extractSite } from "@/lib/product/extract";

const html = readFileSync(
  fileURLToPath(new URL("./fixtures/calai.html", import.meta.url)),
  "utf8",
);
const extract = extractSite(html, "https://calai.app/");

describe("extractSite, against the real calai.app page", () => {
  it("prefers the og:title over the raw <title>", () => {
    // <title> is "Cal AI | Download Today" — the og:title is the product name.
    expect(extract.title).toBe("Cal AI");
  });

  it("keeps the description even when it is marketing filler", () => {
    // calai.app's only description meta is literally "Download Today". This is
    // common, and it is why the brief prompt leans on headings for positioning
    // rather than trusting the description.
    expect(extract.description).toBe("Download Today");
  });

  it("recovers the real positioning from the headings instead", () => {
    expect(extract.headings.join(" ").toLowerCase()).toContain(
      "track your calories with just a picture",
    );
  });

  it("resolves og:image to an absolute url", () => {
    expect(extract.ogImage).toBe("https://www.calai.app/opengraph.jpg");
  });

  it("pulls out headings a script can actually use", () => {
    expect(extract.headings.length).toBeGreaterThan(2);
    expect(extract.headings.join(" ").toLowerCase()).toContain("track your calories");
  });

  it("keeps the social proof that makes an ad credible", () => {
    expect(extract.text).toContain("4.9");
    expect(extract.text.toLowerCase()).toContain("5m users");
  });

  it("does not consider a server-rendered page thin", () => {
    expect(extract.isThin).toBe(false);
    expect(extract.text.length).toBeGreaterThan(1000);
  });

  it("strips script and style content out of the text", () => {
    expect(extract.text).not.toContain("function");
    expect(extract.text).not.toContain("{");
  });
});

describe("thin pages", () => {
  it("flags a JS-only shell so the pipeline can fall back", () => {
    const shell = extractSite(
      '<html><head><title>App</title></head><body><div id="root"></div><script>boot()</script></body></html>',
      "https://spa.test/",
    );
    expect(shell.isThin).toBe(true);
  });
});

describe("decodeEntities", () => {
  it("handles named, decimal and hex entities", () => {
    expect(decodeEntities("Here&#x27;s &amp; there&nbsp;&#39;")).toBe("Here's & there '");
  });
});
