import { describe, expect, it } from "vitest";
import { describeError } from "@/lib/ai/errors";

describe("describeError", () => {
  it("explains a quota failure and how to get past it", () => {
    // Verbatim shape of the failure that actually stopped a render.
    const message = describeError(
      new Error(
        "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.5-flash. Please retry in 48.66s.",
      ),
    );
    expect(message).toContain("free-tier request limit");
    expect(message).toContain("49s");
    expect(message).toContain("your own API key");
  });

  it("names a rejected key as a key problem", () => {
    expect(describeError(new Error("API key not valid. Please pass a valid API key."))).toContain(
      "rejected by the provider",
    );
  });

  it("falls back to something harmless rather than leaking internals", () => {
    const message = describeError(new Error("connect ECONNREFUSED 10.0.0.5:5432 at Socket"));
    expect(message).not.toContain("10.0.0.5");
    expect(message).toBe("Something went wrong talking to the model. Try again.");
  });
});
