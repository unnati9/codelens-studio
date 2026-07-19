import { describe, expect, it } from "vitest";
import { assertSafeCaptureUrl, isPrivateNetworkAddress } from "@/lib/capture/safe-url";

describe("capture SSRF protection", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.10.2",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
  ])("recognizes private or special-use address %s", (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(true);
  });

  it("rejects a public hostname when DNS resolves to a private address", async () => {
    await expect(
      assertSafeCaptureUrl("https://preview.example.test/", {
        resolve: async () => [{ address: "169.254.169.254", family: 4 }],
      }),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("accepts HTTPS only when every resolved address is public", async () => {
    await expect(
      assertSafeCaptureUrl("https://preview.example.test/review", {
        resolve: async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "2606:4700:4700::1111", family: 6 },
        ],
      }),
    ).resolves.toMatchObject({ hostname: "preview.example.test", pathname: "/review" });
  });

  it("allows loopback HTTP only through the explicit local-fixture override", async () => {
    await expect(assertSafeCaptureUrl("http://127.0.0.1:3000/")).rejects.toMatchObject({
      code: "UNSAFE_CAPTURE_URL",
    });
    await expect(
      assertSafeCaptureUrl("http://127.0.0.1:3000/", { allowLocalhost: true }),
    ).resolves.toMatchObject({ hostname: "127.0.0.1" });
  });
});
