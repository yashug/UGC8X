import { describe, expect, it } from "vitest";
import { readImageSize } from "@/lib/media/image-size";
import { pickProductImages, score } from "@/lib/pipeline/assets";
import type { SiteExtract } from "@/lib/product/extract";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(20);
  bytes.set([0xff, 0xd8, 0xff, 0xc0]);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 17); // segment length
  view.setUint16(7, height);
  view.setUint16(9, width);
  return bytes;
}

describe("readImageSize", () => {
  it("reads png dimensions", () => {
    expect(readImageSize(png(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("reads jpeg dimensions from the frame marker", () => {
    expect(readImageSize(jpeg(1080, 1920))).toEqual({ width: 1080, height: 1920 });
  });

  it("returns null for bytes it cannot read, rather than guessing", () => {
    expect(readImageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("distinguishes the landscape og:image case that caused the crop bug", () => {
    const og = readImageSize(png(1200, 630))!;
    const screenshot = readImageSize(png(1170, 2532))!;
    expect(og.width / og.height).toBeGreaterThan(0.85); // -> wide presentation
    expect(screenshot.width / screenshot.height).toBeLessThan(0.85); // -> phone frame
  });
});

describe("product image selection", () => {
  const site = (images: { url: string; alt: string }[]): SiteExtract => ({
    url: "https://x.test/",
    title: "",
    description: "",
    headings: [],
    text: "",
    images,
    appStoreLinks: [],
    isThin: false,
  });

  it("rejects stock photography of people", () => {
    // This is the harbour photo that ended up captioned "100k+ 5-star ratings".
    expect(score({ url: "https://x.test/smiling-man.jpg", alt: "man smiling" })).toBeLessThan(3);
  });

  it("accepts a plausible app screenshot", () => {
    expect(score({ url: "https://x.test/app-screenshot.png", alt: "app screen" })).toBeGreaterThanOrEqual(3);
  });

  it("keeps the og:image as the hero even when nothing else qualifies", () => {
    const picked = pickProductImages(
      { ...site([{ url: "https://x.test/team-photo.jpg", alt: "our team" }]), ogImage: "https://x.test/og.png" },
    );
    expect(picked).toEqual(["https://x.test/og.png"]);
  });

  it("returns nothing rather than a wrong photo", () => {
    expect(pickProductImages(site([{ url: "https://x.test/founder.jpg", alt: "founder" }]))).toEqual([]);
  });
});
