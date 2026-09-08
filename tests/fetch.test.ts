import { describe, expect, it } from "vitest";
import { UnreachableSiteError, fetchSite, isPrivateAddress } from "@/lib/product/fetch";

describe("isPrivateAddress", () => {
  it("blocks loopback, private and link-local ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata — the one that actually gets exploited
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("blocks IPv6 loopback and unique-local", () => {
    for (const address of ["::1", "fe80::1", "fc00::1", "fd12:3456::1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("sees through IPv4-mapped IPv6, a classic bypass", () => {
    expect(isPrivateAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("treats malformed input as unsafe rather than allowed", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateAddress("1.2.3")).toBe(true);
  });
});

describe("fetchSite", () => {
  it("refuses a literal private address", async () => {
    await expect(fetchSite("http://127.0.0.1/")).rejects.toBeInstanceOf(UnreachableSiteError);
  });

  it("refuses the cloud metadata endpoint", async () => {
    await expect(fetchSite("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      /not a public address/,
    );
  });

  it("refuses a non-http scheme", async () => {
    await expect(fetchSite("ftp://example.com/")).rejects.toThrow(/not a fetchable scheme/);
  });
});
