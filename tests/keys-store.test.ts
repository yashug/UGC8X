import { describe, expect, it } from "vitest";
import { seal, unseal } from "@/lib/crypto/secrets";
import { deleteKey, maskedKeys, readKeys, saveKey } from "@/lib/keys/store";

describe("seal / unseal", () => {
  it("round-trips a secret", () => {
    const secret = "sk-ant-api03-not-a-real-key-000";
    expect(unseal(seal(secret))).toBe(secret);
  });

  it("produces different ciphertext each time, so equal keys are not linkable", () => {
    const a = seal("same-secret");
    const b = seal("same-secret");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("refuses tampered ciphertext rather than returning garbage", () => {
    const sealed = seal("secret-value");
    const tampered = { ...sealed, tag: Buffer.alloc(16).toString("base64") };
    expect(unseal(tampered)).toBeNull();
  });

  it("never stores the plaintext in the sealed payload", () => {
    const sealed = seal("sk-live-abcdef");
    expect(JSON.stringify(sealed)).not.toContain("sk-live-abcdef");
  });
});

describe("key store", () => {
  it("returns the key to the server but only a mask to the client", () => {
    const mask = saveKey("session-1", "google", "AIza-super-secret-key-value");

    expect(readKeys("session-1").google).toBe("AIza-super-secret-key-value");
    expect(mask).not.toContain("super-secret");
    expect(maskedKeys("session-1").google).toBe(mask);
  });

  it("scopes keys to a session", () => {
    saveKey("session-a", "pexels", "key-for-a");
    expect(readKeys("session-b").pexels).toBeUndefined();
  });

  it("forgets a deleted key", () => {
    saveKey("session-2", "elevenlabs", "some-key");
    deleteKey("session-2", "elevenlabs");
    expect(readKeys("session-2").elevenlabs).toBeUndefined();
    expect(maskedKeys("session-2").elevenlabs).toBeUndefined();
  });
});
