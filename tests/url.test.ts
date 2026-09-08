import { describe, expect, it } from "vitest";
import { hostOf, normalizeUrl } from "@/lib/ai/url";

describe("normalizeUrl", () => {
  it("accepts a bare domain, which is how people actually type it", () => {
    expect(normalizeUrl("calai.app")).toBe("https://calai.app/");
  });

  it("keeps an explicit scheme and path", () => {
    expect(normalizeUrl("https://linear.app/pricing")).toBe("https://linear.app/pricing");
  });

  it("rejects a hostname with no dot — a typo, not a product site", () => {
    expect(normalizeUrl("localhost")).toBeNull();
    expect(normalizeUrl("calai")).toBeNull();
  });

  it("rejects non-http schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(normalizeUrl("   ")).toBeNull();
  });

  it("rejects things that merely parse as hosts", () => {
    // "working on version 2.0" would otherwise be fetched as https://2.0/
    expect(normalizeUrl("2.0")).toBeNull();
    expect(normalizeUrl("1.2.3.4")).toBeNull();
  });
});

describe("hostOf", () => {
  it("strips www so the card reads cleanly", () => {
    expect(hostOf("https://www.calai.app/")).toBe("calai.app");
  });
});
