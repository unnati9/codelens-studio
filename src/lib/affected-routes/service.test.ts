import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeAffectedRoutes } from "@/lib/affected-routes/analyzer";
import type { RepositoryRouteConfig } from "@/lib/affected-routes/schema";
import { analyzeBoardAffectedRoutes } from "@/lib/affected-routes/service";
import type { GitHubPullRequest } from "@/lib/github/schema";
import { boardSchema } from "@/lib/validation/board";
import { nextAppFixture, routeConfig } from "../../../tests/fixtures/affected-routes";

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
  fetchGitHubPullRequest: vi.fn(),
  fetchGitHubRepositorySnapshot: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));

vi.mock("@/lib/github/server", () => ({
  fetchGitHubPullRequest: mocks.fetchGitHubPullRequest,
}));

vi.mock("@/lib/affected-routes/github-source", () => ({
  fetchGitHubRepositorySnapshot: mocks.fetchGitHubRepositorySnapshot,
}));

const board = boardSchema.parse({
  id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
  title: "Affected routes",
  description: null,
  status: "IN_REVIEW",
  source_type: "GITHUB_PR",
  github_owner: "Octocat",
  github_repository: "Affected-Routes",
  github_pull_request_number: 42,
  github_pull_request_url: "https://github.com/octocat/affected-routes/pull/42",
  github_head_sha: nextAppFixture.headSha,
  github_base_branch: "main",
  github_head_branch: "feature/routes",
  created_by: "guest-1",
  created_at: "2026-07-19T10:00:00.000Z",
  updated_at: "2026-07-19T10:00:00.000Z",
});

const pullRequest: GitHubPullRequest = {
  repositoryFullName: "octocat/affected-routes",
  pullNumber: 42,
  title: "Update button",
  description: null,
  authorLogin: "octocat",
  authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  state: "OPEN",
  baseBranch: "main",
  baseCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  headBranch: "feature/routes",
  headCommitSha: nextAppFixture.headSha,
  htmlUrl: "https://github.com/octocat/affected-routes/pull/42",
  additions: 1,
  deletions: 1,
  changedFileCount: 1,
  files: [
    {
      filename: "src/components/Button.tsx",
      previousFilename: null,
      status: "modified",
      additions: 1,
      deletions: 1,
      changes: 2,
      patch: "@@ -1 +1 @@",
      rawUrl: null,
      blobUrl: null,
    },
  ],
  truncated: false,
  fileLimit: 300,
  importLimit: 20,
  unusuallyLarge: false,
};

const limits = {
  maxDepth: 8,
  maxFiles: 300,
  maxFileSizeBytes: 200_000,
  timeoutMs: 8_000,
};

const cachedAnalysis = analyzeAffectedRoutes({
  snapshot: nextAppFixture,
  changedFiles: ["src/components/Button.tsx"],
  config: null,
  limits,
  now: "2026-07-19T10:30:00.000Z",
});

function resolvedChain(method: "single" | "maybeSingle", data: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain[method].mockResolvedValue({ data, error: null });
  return chain;
}

function mockSupabase(input: { config: RepositoryRouteConfig | null; cache: unknown }) {
  const boardChain = resolvedChain("single", board);
  const configChain = resolvedChain("maybeSingle", input.config);
  const cacheChain = resolvedChain("maybeSingle", input.cache);
  const cacheUpsert = vi.fn().mockResolvedValue({ error: null });
  const client = {
    from: vi.fn((table: string) => {
      if (table === "boards") return { select: boardChain.select };
      if (table === "repository_route_configs") return { select: configChain.select };
      return { select: cacheChain.select, upsert: cacheUpsert };
    }),
  };
  mocks.getSupabaseServerClient.mockReturnValue(client);
  return { cacheUpsert };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchGitHubPullRequest.mockResolvedValue(pullRequest);
  mocks.fetchGitHubRepositorySnapshot.mockResolvedValue(nextAppFixture);
});

describe("affected route analysis service cache", () => {
  it("returns a validated repository/head-SHA cache hit without fetching GitHub", async () => {
    mockSupabase({
      config: null,
      cache: {
        analysis_version: 1,
        config_updated_at: null,
        result: cachedAnalysis,
      },
    });

    const result = await analyzeBoardAffectedRoutes(board.id, { accessToken: "test-access-token" });

    expect(result.cacheHit).toBe(true);
    expect(result.analysis.routes[0].routePath).toBe("/dashboard");
    expect(mocks.fetchGitHubPullRequest).not.toHaveBeenCalled();
    expect(mocks.fetchGitHubRepositorySnapshot).not.toHaveBeenCalled();
  });

  it("invalidates a cache entry when repository configuration changed", async () => {
    const config = routeConfig({ updated_at: "2026-07-19T11:00:00.000Z" });
    const { cacheUpsert } = mockSupabase({
      config,
      cache: {
        analysis_version: 1,
        config_updated_at: "2026-07-19T10:00:00.000Z",
        result: cachedAnalysis,
      },
    });

    const result = await analyzeBoardAffectedRoutes(board.id, { accessToken: "test-access-token" });

    expect(result.cacheHit).toBe(false);
    expect(mocks.fetchGitHubPullRequest).toHaveBeenCalledOnce();
    expect(mocks.fetchGitHubRepositorySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "octocat",
        repository: "affected-routes",
        headSha: nextAppFixture.headSha,
      }),
    );
    expect(cacheUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        github_owner: "octocat",
        github_repository: "affected-routes",
        head_sha: nextAppFixture.headSha,
        analysis_version: 1,
        config_updated_at: config.updated_at,
      }),
      { onConflict: "github_owner,github_repository,head_sha" },
    );
  });
});
