import { captureBaseAndPr, type RawCapturePair } from "@/lib/capture/playwright-capture";
import {
  persistCaptureArtifacts,
  supabaseCaptureArtifactDependencies,
  type CaptureArtifactDependencies,
} from "@/lib/capture/artifacts";
import { CaptureJobError } from "@/lib/capture/service";
import { captureJobSchema, type CaptureJob } from "@/lib/capture/schema";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type CaptureWorkerDependencies = {
  capture?: (job: CaptureJob) => Promise<RawCapturePair>;
  artifacts?: CaptureArtifactDependencies;
};

async function claimNextJob(workerName: string): Promise<CaptureJob | null> {
  const { data, error } = await getSupabaseAdminClient().rpc("claim_next_capture_job", {
    worker_name: workerName,
  });
  if (error) throw new Error(`Could not claim a capture job: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  return row ? captureJobSchema.parse(row) : null;
}

async function markJob(
  job: CaptureJob,
  values: Record<string, unknown>,
  expectedStatus = "RUNNING",
) {
  const { data, error } = await getSupabaseAdminClient()
    .from("capture_jobs")
    .update(values)
    .eq("id", job.id)
    .eq("status", expectedStatus)
    .select()
    .single();
  if (error) throw new Error(`Could not update capture job ${job.id}: ${error.message}`);
  return captureJobSchema.parse(data);
}

async function currentBoardHead(job: CaptureJob) {
  const { data, error } = await getSupabaseAdminClient()
    .from("boards")
    .select("github_head_sha,preview_base_url,preview_url,preview_deployment_status")
    .eq("id", job.board_id)
    .single();
  if (error) throw new CaptureJobError("BOARD_NOT_FOUND", "The capture board no longer exists.");
  return data as {
    github_head_sha: string | null;
    preview_base_url: string | null;
    preview_url: string | null;
    preview_deployment_status: string | null;
  };
}

function safeError(error: unknown) {
  const code = error instanceof CaptureJobError ? error.code : "CAPTURE_FAILED";
  const message = error instanceof Error ? error.message : "Capture failed.";
  return {
    error_code: code.slice(0, 120),
    error_message: message
      .replace(
        /([?&](?:token|key|secret|password|authorization|session)=)[^&#\s]+/gi,
        "$1[REDACTED]",
      )
      .slice(0, 4000),
  };
}

export async function runNextCaptureJob(
  workerName: string,
  dependencies: CaptureWorkerDependencies = {},
): Promise<CaptureJob | null> {
  const job = await claimNextJob(workerName);
  if (!job) return null;
  try {
    const current = await currentBoardHead(job);
    const currentBaseUrl = current.preview_base_url
      ? new URL(current.preview_base_url).toString()
      : null;
    const currentPreviewUrl = current.preview_url ? new URL(current.preview_url).toString() : null;
    if (
      current.github_head_sha?.toLowerCase() !== job.head_sha.toLowerCase() ||
      currentBaseUrl !== new URL(job.base_url).toString() ||
      currentPreviewUrl !== new URL(job.preview_url).toString() ||
      current.preview_deployment_status !== "READY"
    ) {
      return markJob(
        job,
        {
          status: "STALE",
          completed_at: new Date().toISOString(),
          error_code: "CAPTURE_INPUT_STALE",
          error_message:
            "The pull-request SHA or deployment changed after this capture was queued.",
        },
        "RUNNING",
      );
    }

    const capture = await (dependencies.capture ?? captureBaseAndPr)(job);
    const persisted = await persistCaptureArtifacts(
      job,
      capture,
      dependencies.artifacts ?? supabaseCaptureArtifactDependencies(),
    );
    return markJob(job, {
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
      capture_duration_ms: capture.durationMs,
      base_result: persisted.base,
      pr_result: persisted.pr,
      error_code: null,
      error_message: null,
    });
  } catch (error) {
    return markJob(job, {
      status: "FAILED",
      completed_at: new Date().toISOString(),
      ...safeError(error),
    });
  }
}
