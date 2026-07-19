import { z } from "zod";
import {
  captureConfigResponseSchema,
  captureJobResponseSchema,
  captureJobsResponseSchema,
  type CaptureConfigInput,
  type CreateCaptureJobsRequest,
} from "@/lib/capture/schema";

const errorSchema = z.object({ error: z.object({ message: z.string().min(1) }) });

async function body(response: Response, fallback: string) {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(value);
    throw new Error(parsed.success ? parsed.data.error.message : fallback);
  }
  return value;
}

export async function getCaptureConfig(boardId: string) {
  const response = await fetch(`/api/capture-config?boardId=${encodeURIComponent(boardId)}`, {
    cache: "no-store",
  });
  return captureConfigResponseSchema.parse(
    await body(response, "Could not load capture configuration."),
  );
}

export async function saveCaptureConfig(input: CaptureConfigInput) {
  const response = await fetch("/api/capture-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return captureConfigResponseSchema.parse(
    await body(response, "Could not save capture configuration."),
  );
}

export async function listCaptureJobs(boardId: string) {
  const response = await fetch(`/api/capture-jobs?boardId=${encodeURIComponent(boardId)}`, {
    cache: "no-store",
  });
  return captureJobsResponseSchema.parse(await body(response, "Could not load capture jobs."));
}

export async function queueCaptureJobs(input: CreateCaptureJobsRequest) {
  const response = await fetch("/api/capture-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const responseSchema = z.object({
    jobs: captureJobsResponseSchema.shape.jobs,
    deduplicatedCount: z.number().int().nonnegative(),
  });
  return responseSchema.parse(await body(response, "Could not queue capture jobs."));
}

export async function mutateCaptureJob(action: "cancel" | "retry" | "rerun", jobId: string) {
  const response = await fetch("/api/capture-jobs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, jobId }),
  });
  return captureJobResponseSchema.parse(await body(response, "Could not update the capture job."));
}
