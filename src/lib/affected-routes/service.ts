import { z } from "zod";
import { affectedRouteAnalysisLimits, analyzeAffectedRoutes } from "@/lib/affected-routes/analyzer";
import { fetchGitHubRepositorySnapshot } from "@/lib/affected-routes/github-source";
import {
  affectedRouteAnalysisResponseSchema,
  affectedRouteAnalysisSchema,
  affectedRouteConfigResponseSchema,
  repositoryRouteConfigInputSchema,
  repositoryRouteConfigSchema,
  type AffectedRouteAnalysisResponse,
  type RepositoryRouteConfig,
  type RepositoryRouteConfigInput,
} from "@/lib/affected-routes/schema";
import { GitHubImportError, asGitHubImportError } from "@/lib/github/pull-request";
import { fetchPublicGitHubPullRequest } from "@/lib/github/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { boardSchema, type Board } from "@/lib/validation/board";

const analysisVersion = 1;

const cacheRowSchema = z.object({
  analysis_version: z.number().int().positive(),
  config_updated_at: z.string().datetime({ offset: true }).nullable(),
  result: z.unknown(),
});

function linkedRepository(board: Board) {
  if (
    board.source_type !== "GITHUB_PR" ||
    !board.github_owner ||
    !board.github_repository ||
    !board.github_pull_request_number ||
    !board.github_pull_request_url ||
    !board.github_head_sha
  ) {
    throw new GitHubImportError(
      "BOARD_NOT_LINKED",
      "Link this board to a GitHub pull request before analyzing affected routes.",
      409,
    );
  }
  return {
    owner: board.github_owner.toLowerCase(),
    repository: board.github_repository.toLowerCase(),
    pullNumber: board.github_pull_request_number,
    headSha: board.github_head_sha,
  };
}

async function loadBoard(boardId: string): Promise<Board> {
  const { data, error } = await getSupabaseServerClient()
    .from("boards")
    .select("*")
    .eq("id", boardId)
    .single();
  if (error) throw new GitHubImportError("BOARD_NOT_FOUND", "The board could not be found.", 404);
  return boardSchema.parse(data);
}

async function loadConfig(board: Board): Promise<RepositoryRouteConfig | null> {
  const repository = linkedRepository(board);
  const { data, error } = await getSupabaseServerClient()
    .from("repository_route_configs")
    .select("*")
    .eq("github_owner", repository.owner)
    .eq("github_repository", repository.repository)
    .maybeSingle();
  if (error) {
    throw new GitHubImportError(
      "ROUTE_CONFIG_UNAVAILABLE",
      "Could not load repository route configuration.",
      502,
    );
  }
  return data ? repositoryRouteConfigSchema.parse(data) : null;
}

export async function getRepositoryRouteConfig(boardId: string) {
  const config = await loadConfig(await loadBoard(boardId));
  return affectedRouteConfigResponseSchema.parse({ config });
}

export async function saveRepositoryRouteConfig(input: RepositoryRouteConfigInput) {
  const parsed = repositoryRouteConfigInputSchema.parse(input);
  const board = await loadBoard(parsed.boardId);
  const repository = linkedRepository(board);
  const { data, error } = await getSupabaseServerClient()
    .from("repository_route_configs")
    .upsert(
      {
        github_owner: repository.owner,
        github_repository: repository.repository,
        route_mappings: parsed.routeMappings,
        dynamic_route_examples: parsed.dynamicRouteExamples,
        routes_requiring_setup: parsed.routesRequiringSetup,
        ignored_routes: [...new Set(parsed.ignoredRoutes)],
        created_by: parsed.createdBy,
      },
      { onConflict: "github_owner,github_repository" },
    )
    .select()
    .single();
  if (error) {
    throw new GitHubImportError(
      "ROUTE_CONFIG_SAVE_FAILED",
      `Could not save repository route configuration: ${error.message}`,
      502,
    );
  }
  return affectedRouteConfigResponseSchema.parse({
    config: repositoryRouteConfigSchema.parse(data),
  });
}

async function loadCachedAnalysis(
  repository: ReturnType<typeof linkedRepository>,
  config: RepositoryRouteConfig | null,
) {
  const { data, error } = await getSupabaseServerClient()
    .from("affected_route_analysis_cache")
    .select("analysis_version,config_updated_at,result")
    .eq("github_owner", repository.owner)
    .eq("github_repository", repository.repository)
    .eq("head_sha", repository.headSha)
    .maybeSingle();
  if (error) {
    throw new GitHubImportError(
      "ROUTE_CACHE_UNAVAILABLE",
      "Could not load the affected-route analysis cache.",
      502,
    );
  }
  if (!data) return null;
  const cache = cacheRowSchema.safeParse(data);
  if (
    !cache.success ||
    cache.data.analysis_version !== analysisVersion ||
    cache.data.config_updated_at !== (config?.updated_at ?? null)
  ) {
    return null;
  }
  const analysis = affectedRouteAnalysisSchema.safeParse(cache.data.result);
  return analysis.success ? analysis.data : null;
}

async function saveCachedAnalysis(
  repository: ReturnType<typeof linkedRepository>,
  config: RepositoryRouteConfig | null,
  analysis: z.infer<typeof affectedRouteAnalysisSchema>,
) {
  const { error } = await getSupabaseServerClient()
    .from("affected_route_analysis_cache")
    .upsert(
      {
        github_owner: repository.owner,
        github_repository: repository.repository,
        head_sha: repository.headSha,
        analysis_version: analysisVersion,
        config_updated_at: config?.updated_at ?? null,
        result: analysis,
      },
      { onConflict: "github_owner,github_repository,head_sha" },
    );
  if (error) {
    throw new GitHubImportError(
      "ROUTE_CACHE_SAVE_FAILED",
      "The analysis completed but could not be cached.",
      502,
    );
  }
}

export async function analyzeBoardAffectedRoutes(
  boardId: string,
  force = false,
): Promise<AffectedRouteAnalysisResponse> {
  try {
    const board = await loadBoard(boardId);
    const repository = linkedRepository(board);
    const config = await loadConfig(board);
    if (!force) {
      const cached = await loadCachedAnalysis(repository, config);
      if (cached) {
        return affectedRouteAnalysisResponseSchema.parse({
          analysis: cached,
          config,
          cacheHit: true,
        });
      }
    }

    const pullRequest = await fetchPublicGitHubPullRequest({
      owner: repository.owner,
      repository: repository.repository,
      pullNumber: repository.pullNumber,
      canonicalUrl: board.github_pull_request_url!,
    });
    if (pullRequest.headCommitSha.toLowerCase() !== repository.headSha.toLowerCase()) {
      throw new GitHubImportError(
        "BOARD_SOURCE_STALE",
        "The pull-request head changed. Sync the board before re-running route analysis.",
        409,
      );
    }
    const limits = affectedRouteAnalysisLimits();
    const snapshot = await fetchGitHubRepositorySnapshot({
      owner: repository.owner,
      repository: repository.repository,
      headSha: repository.headSha,
      changedFiles: pullRequest.files.map((file) => file.filename),
      limits,
    });
    const analysis = analyzeAffectedRoutes({
      snapshot,
      changedFiles: pullRequest.files.map((file) => file.filename),
      config,
      limits,
    });
    await saveCachedAnalysis(repository, config, analysis);
    return affectedRouteAnalysisResponseSchema.parse({ analysis, config, cacheHit: false });
  } catch (error) {
    throw asGitHubImportError(error);
  }
}
