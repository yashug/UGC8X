import { describe, expect, it } from "vitest";
import { findRenderPromise } from "@/lib/ai/chat";

describe("findRenderPromise", () => {
  it("catches the exact failure it exists for", () => {
    // Observed: the model replied this to a URL and never called the tool.
    expect(
      findRenderPromise("Working on that for you! Linear is a great product for this.", "make a video for linear.app"),
    ).toBe("linear.app");
  });

  it("catches other ways of claiming action", () => {
    for (const claim of ["On it!", "I'll create that now", "Generating your video", "Let me make that"]) {
      expect(findRenderPromise(claim, "here's my site: calai.app"), claim).toBe("calai.app");
    }
  });

  it("stays out of the way when the model made no promise", () => {
    // The model deliberately declining to render must not be overridden.
    expect(
      findRenderPromise("Stripe's pricing page is clear and well structured.", "what do you think of stripe.com's pricing page?"),
    ).toBeNull();
  });

  it("does nothing when there is no URL to act on", () => {
    expect(findRenderPromise("On it!", "make me a video about my startup")).toBeNull();
  });

  it("ignores text that is not a usable domain", () => {
    expect(findRenderPromise("On it!", "working on version 2.0 of the app")).toBeNull();
  });

  it("handles a full url", () => {
    expect(findRenderPromise("I'll generate that", "https://linear.app/pricing please")).toBe(
      "https://linear.app/pricing",
    );
  });
});
