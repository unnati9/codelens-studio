import { describe, expect, it } from "vitest";
import {
  previewDeploymentPollDelay,
  shouldPollPreviewDeployment,
} from "@/lib/preview-deployments/polling";

describe("preview deployment polling", () => {
  it("polls only non-terminal deployment states", () => {
    expect(shouldPollPreviewDeployment("QUEUED")).toBe(true);
    expect(shouldPollPreviewDeployment("BUILDING")).toBe(true);
    expect(shouldPollPreviewDeployment("READY")).toBe(false);
    expect(shouldPollPreviewDeployment("FAILED")).toBe(false);
    expect(shouldPollPreviewDeployment("NOT_FOUND")).toBe(false);
    expect(shouldPollPreviewDeployment(null)).toBe(false);
  });

  it("backs off polling and caps the interval", () => {
    expect([0, 1, 2, 3, 10].map(previewDeploymentPollDelay)).toEqual([
      10_000, 20_000, 30_000, 30_000, 30_000,
    ]);
  });
});
