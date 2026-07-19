import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubPullRequest, GitHubChangedFile } from "@/lib/github/schema";
import type { GitHubRepository } from "@/lib/github/connected-schema";
import type { Board, BoardNodeRecord } from "@/lib/validation/board";
import { syncConnectedGitHubBoard } from "./board-sync";

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
  fetchConnectedGitHubPullRequest: vi.fn(),
  listGitHubAccessibleRepositories: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));

vi.mock("@/lib/github/connected-server", () => ({
  fetchConnectedGitHubPullRequest: mocks.fetchConnectedGitHubPullRequest,
  listGitHubAccessibleRepositories: mocks.listGitHubAccessibleRepositories,
}));

const boardId = "40ad7bd7-b5f4-4374-8c77-15219478ce2b";
const oldHead = "1111111111111111111111111111111111111111";
const newHead = "2222222222222222222222222222222222222222";
const baseSha = "3333333333333333333333333333333333333333";

const repository: GitHubRepository = {
  installationId: 10,
  repositoryId: 20,
  owner: "octocat",
  name: "Hello-World",
  fullName: "octocat/Hello-World",
  isPrivate: false,
  isArchived: false,
  defaultBranch: "main",
  htmlUrl: "https://github.com/octocat/Hello-World",
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
};

const changedFile: GitHubChangedFile = {
  filename: "src/review.ts",
  previousFilename: null,
  status: "modified",
  additions: 2,
  deletions: 1,
  changes: 3,
  patch: "@@ -1 +1 @@\n-old\n+new",
  rawUrl: null,
  blobUrl: "https://github.com/octocat/Hello-World/blob/new/src/review.ts",
};

const pullRequest: GitHubPullRequest = {
  repositoryFullName: repository.fullName,
  pullNumber: 42,
  title: "Refresh review",
  description: "Updated implementation",
  authorLogin: "octocat",
  authorAvatarUrl: repository.ownerAvatarUrl,
  state: "OPEN",
  baseBranch: "main",
  baseCommitSha: baseSha,
  headBranch: "feature/review",
  headCommitSha: newHead,
  htmlUrl: "https://github.com/octocat/Hello-World/pull/42",
  additions: 2,
  deletions: 1,
  changedFileCount: 1,
  files: [changedFile],
  truncated: false,
  fileLimit: 300,
  importLimit: 20,
  unusuallyLarge: false,
};

const linkedBoard: Board = {
  id: boardId,
  title: "Linked review",
  description: null,
  status: "DRAFT",
  source_type: "GITHUB_PR",
  github_owner: repository.owner,
  github_repository: repository.name,
  github_pull_request_number: pullRequest.pullNumber,
  github_pull_request_url: pullRequest.htmlUrl,
  github_head_sha: oldHead,
  github_base_branch: "main",
  github_head_branch: "feature/review",
  github_base_sha: baseSha,
  github_author_login: "octocat",
  github_pull_request_title: "Old title",
  github_pull_request_description: null,
  github_changed_file_count: 1,
  github_last_synced_at: "2026-07-19T08:00:00.000Z",
  last_imported_at: "2026-07-19T08:00:00.000Z",
  preview_provider: "VERCEL",
  preview_base_url: "https://example.com/",
  preview_url: "https://preview.example.com/",
  preview_deployment_id: "dpl_old",
  preview_deployment_status: "READY",
  preview_commit_sha: oldHead,
  preview_branch: "feature/review",
  preview_last_checked_at: "2026-07-19T08:00:00.000Z",
  preview_failure_reason: null,
  created_by: "guest-1",
  created_at: "2026-07-19T08:00:00.000Z",
  updated_at: "2026-07-19T08:00:00.000Z",
};

const oldImportedNode: BoardNodeRecord = {
  id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  board_id: boardId,
  type: "code",
  title: "review.ts",
  position_x: 80,
  position_y: 80,
  width: 680,
  height: 500,
  z_index: 1,
  locked: false,
  content: {
    kind: "code",
    filename: changedFile.filename,
    language: "typescript",
    code: changedFile.patch ?? "",
    source: {
      sourceType: "GITHUB_PR",
      sourceKey: `github-pr:${boardId}:octocat/hello-world:42:${oldHead}:src/review.ts`,
      repository: repository.fullName,
      pullRequestNumber: 42,
      headCommitSha: oldHead,
      filePath: changedFile.filename,
      previousFilePath: null,
      fileStatus: "modified",
      additions: 1,
      deletions: 1,
      blobUrl: changedFile.blobUrl,
      rawUrl: null,
      pullRequestUrl: pullRequest.htmlUrl,
      patchAvailable: true,
      importedAt: "2026-07-19T08:00:00.000Z",
      isStale: false,
      staleAt: null,
      latestHeadCommitSha: oldHead,
    },
  },
  created_by: "guest-1",
  created_at: "2026-07-19T08:00:00.000Z",
  updated_at: "2026-07-19T08:00:00.000Z",
};

function createChain<T>(result: T) {
  const chain = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

function mockSupabase(input: {
  board?: Board;
  nodes?: BoardNodeRecord[];
  savedBoard?: Board;
  savedStaleNode?: BoardNodeRecord;
}) {
  const sourceBoard = input.board ?? linkedBoard;
  const boardSelect = createChain({ data: sourceBoard, error: null });
  const nodesSelect = createChain({ data: input.nodes ?? [], error: null });
  const savedBoard = input.savedBoard ?? {
    ...sourceBoard,
    source_type: "GITHUB_PR" as const,
    github_owner: repository.owner,
    github_repository: repository.name,
    github_pull_request_number: pullRequest.pullNumber,
    github_pull_request_url: pullRequest.htmlUrl,
    github_base_branch: pullRequest.baseBranch,
    github_head_branch: pullRequest.headBranch,
    github_base_sha: pullRequest.baseCommitSha,
    github_head_sha: newHead,
    github_author_login: pullRequest.authorLogin,
    github_pull_request_title: pullRequest.title,
    github_pull_request_description: pullRequest.description,
    github_changed_file_count: pullRequest.changedFileCount,
    github_last_synced_at: "2026-07-19T09:00:00.000Z",
    updated_at: "2026-07-19T09:00:00.000Z",
    ...(sourceBoard.github_head_sha && sourceBoard.github_head_sha !== newHead
      ? {
          preview_url: null,
          preview_deployment_id: null,
          preview_deployment_status: "NOT_FOUND" as const,
          preview_commit_sha: newHead,
          preview_branch: pullRequest.headBranch,
          preview_last_checked_at: null,
          preview_failure_reason:
            "The pull-request head changed. Refresh preview deployment discovery.",
        }
      : {}),
  };
  const boardUpdate = createChain({ data: savedBoard, error: null });
  const staleNodeUpdate = createChain({
    data:
      input.savedStaleNode ??
      ({
        ...oldImportedNode,
        content: {
          ...oldImportedNode.content,
          source:
            oldImportedNode.content.kind === "code" && oldImportedNode.content.source
              ? {
                  ...oldImportedNode.content.source,
                  isStale: true,
                  staleAt: "2026-07-19T09:00:00.000Z",
                  latestHeadCommitSha: newHead,
                }
              : undefined,
        },
        updated_at: "2026-07-19T09:00:00.000Z",
      } as BoardNodeRecord),
    error: null,
  });
  const boardsTable = {
    select: vi.fn().mockReturnValue(boardSelect),
    update: vi.fn().mockReturnValue(boardUpdate),
  };
  const nodesTable = {
    select: vi.fn().mockReturnValue(nodesSelect),
    update: vi.fn().mockReturnValue(staleNodeUpdate),
  };
  mocks.getSupabaseServerClient.mockReturnValue({
    from: vi.fn((table: string) => (table === "boards" ? boardsTable : nodesTable)),
  });
  return { boardsTable, nodesTable };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchConnectedGitHubPullRequest.mockResolvedValue({ repository, pullRequest });
  mocks.listGitHubAccessibleRepositories.mockResolvedValue({
    installations: [],
    repositories: [repository],
  });
});

describe("syncConnectedGitHubBoard", () => {
  it("detects a new head and persists stale imported nodes without deleting them", async () => {
    const { boardsTable, nodesTable } = mockSupabase({ nodes: [oldImportedNode] });

    const result = await syncConnectedGitHubBoard({
      accessToken: "github-user-token",
      boardId,
      now: "2026-07-19T09:00:00.000Z",
    });

    expect(result.headChanged).toBe(true);
    expect(result.staleNodes).toHaveLength(1);
    expect(result.staleNodes[0].content).toMatchObject({
      source: { isStale: true, latestHeadCommitSha: newHead },
    });
    expect(nodesTable.update).toHaveBeenCalledOnce();
    expect(boardsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        github_base_sha: baseSha,
        github_head_sha: newHead,
        github_changed_file_count: 1,
        preview_url: null,
        preview_deployment_id: null,
        preview_deployment_status: "NOT_FOUND",
        preview_commit_sha: newHead,
      }),
    );
    expect(result.board.preview_url).toBeNull();
    expect(result.board.preview_commit_sha).toBe(newHead);
  });

  it("links a manual board without automatically importing files", async () => {
    const manualBoard: Board = {
      ...linkedBoard,
      source_type: null,
      github_owner: null,
      github_repository: null,
      github_pull_request_number: null,
      github_pull_request_url: null,
      github_head_sha: null,
      github_base_branch: null,
      github_head_branch: null,
      github_base_sha: null,
      github_author_login: null,
      github_pull_request_title: null,
      github_pull_request_description: null,
      github_changed_file_count: null,
      github_last_synced_at: null,
      last_imported_at: null,
      preview_provider: null,
      preview_base_url: null,
      preview_url: null,
      preview_deployment_id: null,
      preview_deployment_status: null,
      preview_commit_sha: null,
      preview_branch: null,
      preview_last_checked_at: null,
      preview_failure_reason: null,
    };
    mockSupabase({ board: manualBoard, nodes: [] });

    const result = await syncConnectedGitHubBoard({
      accessToken: "github-user-token",
      boardId,
      selection: {
        installationId: repository.installationId,
        repositoryId: repository.repositoryId,
        owner: repository.owner,
        repository: repository.name,
        pullNumber: pullRequest.pullNumber,
      },
      now: "2026-07-19T09:00:00.000Z",
    });

    expect(result.headChanged).toBe(false);
    expect(result.staleNodes).toEqual([]);
    expect(result.board.source_type).toBe("GITHUB_PR");
  });

  it("does not persist private repository metadata under public board policies", async () => {
    const { boardsTable, nodesTable } = mockSupabase({ nodes: [] });
    mocks.fetchConnectedGitHubPullRequest.mockResolvedValue({
      repository: { ...repository, isPrivate: true },
      pullRequest,
    });

    await expect(
      syncConnectedGitHubBoard({
        accessToken: "github-user-token",
        boardId,
        now: "2026-07-19T09:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "PRIVATE_REPOSITORY_UNSAFE", status: 403 });
    expect(nodesTable.select).not.toHaveBeenCalled();
    expect(boardsTable.update).not.toHaveBeenCalled();
  });
});
