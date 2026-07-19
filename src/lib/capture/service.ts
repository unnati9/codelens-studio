import { createHash } from "node:crypto";
import { ZodError } from "zod";
import {
  captureConfigInputSchema,
  captureConfigResponseSchema,
  captureConfigSchema,
  captureJobActionRequestSchema,
  captureJobResponseSchema,
  captureJobSchema,
  captureJobsResponseSchema,
  createCaptureJobsRequestSchema,
  defaultCaptureOptions,
  defaultCaptureViewports,
  type CaptureConfig,
  type CaptureJob,
  type CaptureViewport,
  type CreateCaptureJobsRequest,
} from "@/lib/capture/schema";
import { validatePreviewDeploymentUrl } from "@/lib/preview-deployments/safe-url";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { boardSchema, type Board } from "@/lib/validation/board";

export class CaptureJobError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CaptureJobError";
  }
}

function normalizedError(error: unknown) {
  if (error instanceof CaptureJobError || error instanceof ZodError) return error;
  return new CaptureJobError(
    "CAPTURE_SERVICE_ERROR",
    error instanceof Error ? error.message : "The capture service failed.",
    500,
  );
}

async function loadBoard(boardId: string): Promise<Board> {
  const { data, error } = await getSupabaseAdminClient()
    .from("boards")
    .select("*")
    .eq("id", boardId)
    .single();
  if (error) throw new CaptureJobError("BOARD_NOT_FOUND", "The board could not be found.", 404);
  return boardSchema.parse(data);
}

function linkedRepository(board: Board) {
  if (
    board.source_type !== "GITHUB_PR" ||
    !board.github_owner ||
    !board.github_repository ||
    !board.github_head_sha
  ) {
    throw new CaptureJobError(
      "BOARD_NOT_LINKED",
      "Link this board to a GitHub pull request before capturing routes.",
      409,
    );
  }
  return {
    owner: board.github_owner.toLowerCase(),
    repository: board.github_repository.toLowerCase(),
    headSha: board.github_head_sha,
  };
}

function captureUrls(board: Board) {
  if (
    !board.preview_base_url ||
    !board.preview_url ||
    board.preview_deployment_status !== "READY"
  ) {
    throw new CaptureJobError(
      "DEPLOYMENTS_NOT_READY",
      "A ready base deployment and PR preview deployment are required before capture.",
      409,
    );
  }
  return {
    baseUrl: validatePreviewDeploymentUrl(board.preview_base_url),
    previewUrl: validatePreviewDeploymentUrl(board.preview_url),
  };
}

async function loadCaptureConfig(board: Board): Promise<CaptureConfig | null> {
  const repository = linkedRepository(board);
  const { data, error } = await getSupabaseAdminClient()
    .from("repository_capture_configs")
    .select("*")
    .eq("github_owner", repository.owner)
    .eq("github_repository", repository.repository)
    .maybeSingle();
  if (error) {
    throw new CaptureJobError(
      "CAPTURE_CONFIG_UNAVAILABLE",
      "Could not load capture configuration.",
      502,
    );
  }
  return data ? captureConfigSchema.parse(data) : null;
}

function defaultConfig(board: Board): CaptureConfig {
  const repository = linkedRepository(board);
  const now = new Date().toISOString();
  return captureConfigSchema.parse({
    id: crypto.randomUUID(),
    github_owner: repository.owner,
    github_repository: repository.repository,
    capture_options: defaultCaptureOptions,
    viewports: defaultCaptureViewports,
    storage_state_env_var: null,
    login_setup: [],
    created_by: "default",
    created_at: now,
    updated_at: now,
  });
}

export async function getCaptureConfig(boardId: string) {
  const board = await loadBoard(boardId);
  return captureConfigResponseSchema.parse({ config: await loadCaptureConfig(board) });
}

export async function saveCaptureConfig(input: unknown) {
  const parsed = captureConfigInputSchema.parse(input);
  const board = await loadBoard(parsed.boardId);
  const repository = linkedRepository(board);
  const { data, error } = await getSupabaseAdminClient()
    .from("repository_capture_configs")
    .upsert(
      {
        github_owner: repository.owner,
        github_repository: repository.repository,
        capture_options: parsed.options,
        viewports: parsed.viewports,
        storage_state_env_var: parsed.storageStateEnvVar,
        login_setup: parsed.loginSetup,
        created_by: parsed.createdBy,
      },
      { onConflict: "github_owner,github_repository" },
    )
    .select()
    .single();
  if (error) {
    throw new CaptureJobError(
      "CAPTURE_CONFIG_SAVE_FAILED",
      `Could not save capture configuration: ${error.message}`,
      502,
    );
  }
  return captureConfigResponseSchema.parse({ config: captureConfigSchema.parse(data) });
}

function captureKey(input: {
  boardId: string;
  routePath: string;
  resolvedPath: string;
  headSha: string;
  viewport: CaptureViewport;
  scenario: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.boardId,
        input.routePath,
        input.resolvedPath,
        input.headSha.toLowerCase(),
        input.viewport,
        input.scenario,
      ]),
    )
    .digest("hex");
}

async function insertJob(
  input: CreateCaptureJobsRequest,
  board: Board,
  config: CaptureConfig,
  viewport: CaptureViewport,
  route: CreateCaptureJobsRequest["routes"][number],
) {
  const urls = captureUrls(board);
  const key = captureKey({
    boardId: board.id,
    routePath: route.routePath,
    resolvedPath: route.resolvedPath,
    headSha: board.github_head_sha!,
    viewport,
    scenario: route.scenario,
  });
  const row = {
    board_id: board.id,
    capture_config_id: config.created_by === "default" ? null : config.id,
    route_path: route.routePath,
    resolved_path: route.resolvedPath,
    head_sha: board.github_head_sha,
    base_sha: board.github_base_sha,
    scenario: route.scenario,
    viewport,
    capture_options: config.capture_options,
    auth_config: {
      storageStateEnvVar: config.storage_state_env_var,
      loginSetup: config.login_setup,
    },
    base_url: urls.baseUrl,
    preview_url: urls.previewUrl,
    capture_key: key,
    created_by: input.createdBy,
  };
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from("capture_jobs").insert(row).select().single();
  if (!error) return { job: captureJobSchema.parse(data), deduplicated: false };
  if (error.code === "23505") {
    const existing = await client
      .from("capture_jobs")
      .select("*")
      .eq("capture_key", key)
      .neq("status", "STALE")
      .single();
    if (!existing.error) {
      return { job: captureJobSchema.parse(existing.data), deduplicated: true };
    }
  }
  throw new CaptureJobError(
    "CAPTURE_JOB_CREATE_FAILED",
    `Could not queue capture: ${error.message}`,
    502,
  );
}

export async function createCaptureJobs(input: unknown) {
  try {
    const parsed = createCaptureJobsRequestSchema.parse(input);
    const board = await loadBoard(parsed.boardId);
    captureUrls(board);
    const config = (await loadCaptureConfig(board)) ?? defaultConfig(board);
    const selectedViewports = config.viewports.filter((viewport) =>
      parsed.viewportNames.includes(viewport.name),
    );
    if (selectedViewports.length !== new Set(parsed.viewportNames).size) {
      throw new CaptureJobError(
        "VIEWPORT_NOT_CONFIGURED",
        "One or more selected viewports are not configured for this repository.",
      );
    }
    const results = [];
    for (const route of parsed.routes) {
      for (const viewport of selectedViewports) {
        results.push(await insertJob(parsed, board, config, viewport, route));
      }
    }
    return {
      jobs: results.map((result) => result.job),
      deduplicatedCount: results.filter((result) => result.deduplicated).length,
    };
  } catch (error) {
    throw normalizedError(error);
  }
}

export async function listCaptureJobs(boardId: string) {
  await loadBoard(boardId);
  const { data, error } = await getSupabaseAdminClient()
    .from("capture_jobs")
    .select("*")
    .eq("board_id", boardId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    throw new CaptureJobError("CAPTURE_JOBS_UNAVAILABLE", "Could not load capture jobs.", 502);
  }
  return captureJobsResponseSchema.parse({ jobs: data });
}

async function replaceTerminalJob(job: CaptureJob, action: "retry" | "rerun") {
  if (action === "retry" && job.status !== "FAILED") {
    throw new CaptureJobError("JOB_NOT_RETRYABLE", "Only failed capture jobs can be retried.", 409);
  }
  if (action === "rerun" && ["QUEUED", "RUNNING", "STALE"].includes(job.status)) {
    throw new CaptureJobError("JOB_NOT_RERUNNABLE", "This capture job cannot be re-run yet.", 409);
  }
  if (job.attempt >= 20) {
    throw new CaptureJobError(
      "ATTEMPT_LIMIT_REACHED",
      "The capture attempt limit was reached.",
      409,
    );
  }

  const client = getSupabaseAdminClient();
  const stale = await client
    .from("capture_jobs")
    .update({ status: "STALE" })
    .eq("id", job.id)
    .eq("status", job.status);
  if (stale.error) {
    throw new CaptureJobError("CAPTURE_JOB_UPDATE_FAILED", "Could not supersede the old job.", 502);
  }
  const { data, error } = await client
    .from("capture_jobs")
    .insert({
      board_id: job.board_id,
      capture_config_id: job.capture_config_id,
      route_path: job.route_path,
      resolved_path: job.resolved_path,
      head_sha: job.head_sha,
      base_sha: job.base_sha,
      scenario: job.scenario,
      viewport: job.viewport,
      capture_options: job.capture_options,
      auth_config: job.auth_config,
      base_url: job.base_url,
      preview_url: job.preview_url,
      capture_key: job.capture_key,
      attempt: job.attempt + 1,
      retry_of: action === "retry" ? job.id : null,
      rerun_of: action === "rerun" ? job.id : null,
      created_by: job.created_by,
    })
    .select()
    .single();
  if (error) {
    await client.from("capture_jobs").update({ status: job.status }).eq("id", job.id);
    throw new CaptureJobError("CAPTURE_JOB_CREATE_FAILED", "Could not create the new job.", 502);
  }
  return captureJobResponseSchema.parse({ job: data, deduplicated: false });
}

export async function updateCaptureJob(input: unknown) {
  const parsed = captureJobActionRequestSchema.parse(input);
  const client = getSupabaseAdminClient();
  const existing = await client.from("capture_jobs").select("*").eq("id", parsed.jobId).single();
  if (existing.error) {
    throw new CaptureJobError("CAPTURE_JOB_NOT_FOUND", "The capture job was not found.", 404);
  }
  const job = captureJobSchema.parse(existing.data);
  if (parsed.action === "cancel") {
    if (job.status !== "QUEUED") {
      throw new CaptureJobError("JOB_NOT_CANCELLABLE", "Only queued jobs can be cancelled.", 409);
    }
    const { data, error } = await client
      .from("capture_jobs")
      .update({ status: "CANCELLED", completed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "QUEUED")
      .select()
      .single();
    if (error) {
      throw new CaptureJobError("CAPTURE_JOB_UPDATE_FAILED", "Could not cancel the job.", 502);
    }
    return captureJobResponseSchema.parse({ job: data, deduplicated: false });
  }
  return replaceTerminalJob(job, parsed.action);
}
