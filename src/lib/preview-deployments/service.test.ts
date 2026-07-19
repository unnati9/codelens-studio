import { beforeEach, describe, expect, it, vi } from "vitest";
import { boardSchema, type Board } from "@/lib/validation/board";
import type {
  PreviewDeploymentDiscovery,
  RepositoryPreviewConfig,
} from "@/lib/preview-deployments/schema";
import { refreshPreviewDeployment } from "@/lib/preview-deployments/service";

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
  discover: vi.fn(),
  getPreviewDeploymentProvider: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));

vi.mock("@/lib/preview-deployments/providers", () => ({
  getPreviewDeploymentProvider: mocks.getPreviewDeploymentProvider,
}));

const board: Board = boardSchema.parse({
  id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
  title: "Preview review",
  description: null,
  status: "IN_REVIEW",
  source_type: "GITHUB_PR",
  github_owner: "Octocat",
  github_repository: "Hello-World",
  github_pull_request_number: 42,
  github_pull_request_url: "https://github.com/octocat/Hello-World/pull/42",
  github_head_sha: "2222222222222222222222222222222222222222",
  github_base_branch: "main",
  github_head_branch: "feature/preview",
  created_by: "guest-1",
  created_at: "2026-07-19T09:00:00.000Z",
  updated_at: "2026-07-19T09:00:00.000Z",
});

const config: RepositoryPreviewConfig = {
  id: "ffcc85a7-a023-490b-a65b-04cc90b36fb6",
  github_owner: "octocat",
  github_repository: "hello-world",
  provider: "VERCEL",
  vercel_project_id: "prj_CodeLens123",
  vercel_team_id: "team_Studio123",
  production_url: "https://codelens.example.com/",
  enabled: true,
  created_by: "guest-1",
  created_at: "2026-07-19T09:00:00.000Z",
  updated_at: "2026-07-19T09:00:00.000Z",
};

const discovery: PreviewDeploymentDiscovery = {
  provider: "VERCEL",
  baseDeploymentUrl: config.production_url,
  previewUrl: "https://codelens-pr-42.vercel.app/",
  deploymentId: "dpl_preview42",
  status: "READY",
  commitSha: board.github_head_sha,
  branch: board.github_head_branch,
  lastCheckedAt: "2026-07-19T10:00:00.000Z",
  failureReason: null,
  matchType: "SHA",
};

function mockSupabase(repositoryConfig: RepositoryPreviewConfig | null) {
  let boardPatch: Partial<Board> = {};
  const boardSelect = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: board, error: null }),
  };
  boardSelect.select.mockReturnValue(boardSelect);
  boardSelect.eq.mockReturnValue(boardSelect);

  const configSelect = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: repositoryConfig, error: null }),
  };
  configSelect.select.mockReturnValue(configSelect);
  configSelect.eq.mockReturnValue(configSelect);

  const boardUpdate = {
    update: vi.fn((patch: Partial<Board>) => {
      boardPatch = patch;
      return boardUpdate;
    }),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({
      data: { ...board, ...boardPatch, updated_at: "2026-07-19T10:00:01.000Z" },
      error: null,
    })),
  };
  boardUpdate.eq.mockReturnValue(boardUpdate);
  boardUpdate.select.mockReturnValue(boardUpdate);

  const boardsTable = {
    select: boardSelect.select,
    update: boardUpdate.update,
  };
  const configTable = { select: configSelect.select };
  const client = {
    from: vi.fn((table: string) =>
      table === "repository_preview_configs" ? configTable : boardsTable,
    ),
  };
  mocks.getSupabaseServerClient.mockReturnValue(client);
  return { boardUpdate, configSelect, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPreviewDeploymentProvider.mockReturnValue({
    provider: "VERCEL",
    discover: mocks.discover,
    testConnection: vi.fn(),
  });
  mocks.discover.mockResolvedValue(discovery);
});

describe("preview deployment service", () => {
  it("discovers and persists the deployment for a linked repository", async () => {
    const { boardUpdate, configSelect } = mockSupabase(config);

    const result = await refreshPreviewDeployment(board.id);

    expect(configSelect.eq).toHaveBeenNthCalledWith(1, "github_owner", "octocat");
    expect(configSelect.eq).toHaveBeenNthCalledWith(2, "github_repository", "hello-world");
    expect(mocks.discover).toHaveBeenCalledWith({
      projectId: config.vercel_project_id,
      teamId: config.vercel_team_id,
      productionUrl: config.production_url,
      headCommitSha: board.github_head_sha,
      headBranch: board.github_head_branch,
    });
    expect(boardUpdate.update).toHaveBeenCalledWith({
      preview_provider: "VERCEL",
      preview_base_url: discovery.baseDeploymentUrl,
      preview_url: discovery.previewUrl,
      preview_deployment_id: discovery.deploymentId,
      preview_deployment_status: "READY",
      preview_commit_sha: discovery.commitSha,
      preview_branch: discovery.branch,
      preview_last_checked_at: discovery.lastCheckedAt,
      preview_failure_reason: null,
    });
    expect(result.board.preview_url).toBe(discovery.previewUrl);
    expect(result.deployment.matchType).toBe("SHA");
  });

  it("persists a visible not-found state when repository configuration is missing", async () => {
    const { boardUpdate } = mockSupabase(null);

    const result = await refreshPreviewDeployment(board.id);

    expect(mocks.getPreviewDeploymentProvider).not.toHaveBeenCalled();
    expect(boardUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        preview_provider: null,
        preview_url: null,
        preview_deployment_status: "NOT_FOUND",
        preview_commit_sha: board.github_head_sha,
        preview_branch: board.github_head_branch,
        preview_failure_reason: "Configure a preview deployment provider for this repository.",
      }),
    );
    expect(result.deployment.status).toBe("NOT_FOUND");
  });
});
