import type { PreviewDeploymentStatus } from "@/lib/validation/board";

export function shouldPollPreviewDeployment(status: PreviewDeploymentStatus | null): boolean {
  return status === "QUEUED" || status === "BUILDING";
}

export function previewDeploymentPollDelay(attempt: number): number {
  return Math.min(30_000, 10_000 * 2 ** Math.max(0, Math.min(attempt, 2)));
}
