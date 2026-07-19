import { describe, expect, it } from "vitest";
import { validatePreviewDeploymentUrl } from "@/lib/preview-deployments/safe-url";

describe("validatePreviewDeploymentUrl", () => {
  it("accepts and normalizes public HTTPS deployment URLs", () => {
    expect(validatePreviewDeploymentUrl("https://preview.example.com/review", "production")).toBe(
      "https://preview.example.com/review",
    );
  });

  it.each([
    "http://preview.example.com",
    "https://127.0.0.1",
    "https://10.0.0.8",
    "https://service.internal",
    "https://user:password@preview.example.com",
  ])("rejects unsafe production URL %s", (url) => {
    expect(() => validatePreviewDeploymentUrl(url, "production")).toThrow();
  });

  it("allows HTTP only for a local development host", () => {
    expect(validatePreviewDeploymentUrl("http://localhost:3000", "development")).toBe(
      "http://localhost:3000/",
    );
    expect(() => validatePreviewDeploymentUrl("http://192.168.1.5:3000", "development")).toThrow();
  });
});
