import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRemoteRenderConfigured, signPayload, verifySignature } from "@/lib/render/dispatch";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.RENDER_CALLBACK_SECRET = "test-callback-secret";
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("callback signatures", () => {
  const body = JSON.stringify({ jobId: "abc", videoUrl: "https://r2.test/a.mp4" });

  it("accepts a signature it produced", () => {
    expect(verifySignature(body, signPayload(body))).toBe(true);
  });

  it("rejects a body that was altered after signing", () => {
    // The attack this exists to stop: swap the video URL for your own.
    const signature = signPayload(body);
    const tampered = JSON.stringify({ jobId: "abc", videoUrl: "https://evil.test/x.mp4" });
    expect(verifySignature(tampered, signature)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const signature = signPayload(body);
    process.env.RENDER_CALLBACK_SECRET = "someone-elses-secret";
    expect(verifySignature(body, signature)).toBe(false);
  });

  it("rejects an empty or missing signature", () => {
    expect(verifySignature(body, "")).toBe(false);
    expect(verifySignature(body, "not-hex")).toBe(false);
  });

  it("refuses to verify anything when no secret is configured", () => {
    delete process.env.RENDER_CALLBACK_SECRET;
    expect(verifySignature(body, "a".repeat(64))).toBe(false);
  });
});

describe("isRemoteRenderConfigured", () => {
  it("is false unless every piece is present, so it falls back to local", () => {
    delete process.env.GH_RENDER_TOKEN;
    expect(isRemoteRenderConfigured()).toBe(false);
  });
});
