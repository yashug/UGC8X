import { afterEach, describe, expect, it } from "vitest";
import { USER_KEYS_HEADER, maskKey, readUserKeys, redact, resolveKeys } from "@/lib/providers/keys";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("resolveKeys", () => {
  it("prefers the user's key over ours, per provider", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "server-google";
    process.env.PEXELS_API_KEY = "server-pexels";

    const { keys, sources } = resolveKeys({ google: "user-google" });

    expect(keys.google).toBe("user-google");
    expect(sources.google).toBe("user");
    // Untouched providers still fall back to ours — upgrades are per-capability.
    expect(keys.pexels).toBe("server-pexels");
    expect(sources.pexels).toBe("server");
  });

  it("reports none when neither side has a key", () => {
    delete process.env.FAL_KEY;
    expect(resolveKeys().sources.fal).toBe("none");
  });
});

describe("readUserKeys", () => {
  function withHeader(value: string) {
    return new Request("https://x.test", { headers: { [USER_KEYS_HEADER]: value } });
  }

  it("reads known providers and ignores anything else", () => {
    const keys = readUserKeys(
      withHeader(JSON.stringify({ google: "g", nonsense: "x", anthropic: "  " })),
    );
    expect(keys).toEqual({ google: "g" });
  });

  it("survives malformed json rather than throwing mid-request", () => {
    expect(readUserKeys(withHeader("{not json"))).toEqual({});
  });
});

describe("redaction", () => {
  it("strips a key out of an error message", () => {
    const message = redact("401 from provider with sk-live-abcdef123456", {
      google: "sk-live-abcdef123456",
    });
    expect(message).not.toContain("sk-live-abcdef123456");
    expect(message).toContain("[redacted]");
  });

  it("masks a key for display without revealing it", () => {
    const masked = maskKey("sk-ant-api03-ABCDEFGHIJK");
    expect(masked).toBe("sk-ant…HIJK");
  });
});
