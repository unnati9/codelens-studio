import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PreviewDeploymentError, asPreviewDeploymentError } from "@/lib/preview-deployments/error";
import { getPreviewDeploymentProvider } from "@/lib/preview-deployments/providers";
import {
  previewConfigurationResponseSchema,
  previewDeploymentDiscoverySchema,
  previewRefreshResponseSchema,
  repositoryPreviewConfigInputSchema,
  repositoryPreviewConfigSchema,
  type PreviewDeploymentDiscovery,
  type PreviewRefreshResponse,
  type RepositoryPreviewConfig,
  type RepositoryPreviewConfigInput,
} from "@/lib/preview-deployments/schema";
import { validatePreviewDeploymentUrl } from "@/lib/preview-deployments/safe-url";
import { boardSchema, type Board } from "@/lib/validation/board";

function assertLinkedRepository(board: Board) {
  if (
    board.source_type !== "GITHUB_PR" ||
    !board.github_owner ||
    !board.github_repository ||
    !board.github_head_sha ||
    !board.github_head_branch
  ) {
    throw new PreviewDeploymentError(
      "BOARD_NOT_LINKED",
      "Link this board to a GitHub pull request before configuring preview discovery.",
      409,
    );
  }
  return {
    owner: board.github_owner.toLowerCase(),
    repository: board.github_repository.toLowerCase(),
  };
}

async function loadBoard(boardId: string): Promise<Board> {
  const { data, error } = await getSupabaseServerClient()
    .from("boards")
    .select("*")
    .eq("id", boardId)
    .single();
  if (error) {
    throw new PreviewDeploymentError("BOARD_NOT_FOUND", "The board could not be found.", 404);
  }
  return boardSchema.parse(data);
}

async function loadRepositoryConfig(board: Board): Promise<RepositoryPreviewConfig | null> {
  const repository = assertLinkedRepository(board);
  const { data, error } = await getSupabaseServerClient()
    .from("repository_preview_configs")
    .select("*")
    .eq("github_owner", repository.owner)
    .eq("github_repository", repository.repository)
    .maybeSingle();
  if (error) {
    throw new PreviewDeploymentError(
      "PREVIEW_CONFIG_UNAVAILABLE",
      "Could not load preview deployment configuration.",
      502,
    );
  }
  return data ? repositoryPreviewConfigSchema.parse(data) : null;
}

export async function getPreviewConfiguration(boardId: string) {
  const board = await loadBoard(boardId);
  const config = await loadRepositoryConfig(board);
  return previewConfigurationResponseSchema.parse({
    board,
    config,
    tokenConfigured: Boolean(process.env.VERCEL_TOKEN?.trim()),
  });
}

export async function savePreviewConfiguration(
  input: RepositoryPreviewConfigInput,
): Promise<ReturnType<typeof previewConfigurationResponseSchema.parse>> {
  const parsedInput = repositoryPreviewConfigInputSchema.parse(input);
  const board = await loadBoard(parsedInput.boardId);
  const repository = assertLinkedRepository(board);
  const projectId = parsedInput.vercelProjectId || null;
  const teamId = parsedInput.vercelTeamId || null;
  const productionUrl = parsedInput.productionUrl
    ? validatePreviewDeploymentUrl(parsedInput.productionUrl)
    : null;
  const { data, error } = await getSupabaseServerClient()
    .from("repository_preview_configs")
    .upsert(
      {
        github_owner: repository.owner,
        github_repository: repository.repository,
        provider: parsedInput.provider,
        vercel_project_id: projectId,
        vercel_team_id: teamId,
        production_url: productionUrl,
        enabled: parsedInput.enabled,
        created_by: parsedInput.createdBy,
      },
      { onConflict: "github_owner,github_repository" },
    )
    .select()
    .single();
  if (error) {
    throw new PreviewDeploymentError(
      "PREVIEW_CONFIG_SAVE_FAILED",
      `Could not save preview configuration: ${error.message}`,
      502,
    );
  }
  return previewConfigurationResponseSchema.parse({
    board,
    config: repositoryPreviewConfigSchema.parse(data),
    tokenConfigured: Boolean(process.env.VERCEL_TOKEN?.trim()),
  });
}

function unavailableDiscovery(
  board: Board,
  config: RepositoryPreviewConfig | null,
  reason: string,
): PreviewDeploymentDiscovery {
  return previewDeploymentDiscoverySchema.parse({
    provider: config?.provider ?? "VERCEL",
    baseDeploymentUrl: config?.production_url ?? null,
    previewUrl: null,
    deploymentId: null,
    status: "NOT_FOUND",
    commitSha: board.github_head_sha,
    branch: board.github_head_branch,
    lastCheckedAt: new Date().toISOString(),
    failureReason: reason,
    matchType: null,
  });
}

async function persistDiscovery(
  board: Board,
  config: RepositoryPreviewConfig | null,
  discovery: PreviewDeploymentDiscovery,
): Promise<Board> {
  const { data, error } = await getSupabaseServerClient()
    .from("boards")
    .update({
      preview_provider: config?.provider ?? null,
      preview_base_url: discovery.baseDeploymentUrl,
      preview_url: discovery.previewUrl,
      preview_deployment_id: discovery.deploymentId,
      preview_deployment_status: discovery.status,
      preview_commit_sha: discovery.commitSha,
      preview_branch: discovery.branch,
      preview_last_checked_at: discovery.lastCheckedAt,
      preview_failure_reason: discovery.failureReason,
    })
    .eq("id", board.id)
    .select()
    .single();
  if (error) {
    throw new PreviewDeploymentError(
      "PREVIEW_STATUS_SAVE_FAILED",
      "Could not save the preview deployment status.",
      502,
    );
  }
  return boardSchema.parse(data);
}

export async function refreshPreviewDeployment(boardId: string): Promise<PreviewRefreshResponse> {
  try {
    const board = await loadBoard(boardId);
    assertLinkedRepository(board);
    const config = await loadRepositoryConfig(board);
    let discovery: PreviewDeploymentDiscovery;
    if (!config) {
      discovery = unavailableDiscovery(
        board,
        null,
        "Configure a preview deployment provider for this repository.",
      );
    } else if (!config.enabled) {
      discovery = unavailableDiscovery(board, config, "Preview deployment discovery is disabled.");
    } else if (!config.vercel_project_id || !config.production_url) {
      discovery = unavailableDiscovery(
        board,
        config,
        "The preview deployment configuration is incomplete.",
      );
    } else {
      const provider = getPreviewDeploymentProvider(config.provider);
      discovery = await provider.discover({
        projectId: config.vercel_project_id,
        teamId: config.vercel_team_id,
        productionUrl: config.production_url,
        headCommitSha: board.github_head_sha!,
        headBranch: board.github_head_branch!,
      });
    }
    const savedBoard = await persistDiscovery(board, config, discovery);
    return previewRefreshResponseSchema.parse({ board: savedBoard, deployment: discovery });
  } catch (error) {
    throw asPreviewDeploymentError(error);
  }
}
