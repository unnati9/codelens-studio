import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchConnectedGitHubPullRequest,
  listGitHubAccessibleRepositories,
} from "@/lib/github/connected-server";
import type { GitHubConnectedPullRequestRequest } from "@/lib/github/connected-schema";
import { GitHubImportError, asGitHubImportError } from "@/lib/github/pull-request";
import { markOldGitHubImportedNodesStale } from "@/lib/github/stale";
import {
  githubBoardSyncResponseSchema,
  type GitHubBoardSyncResponse,
} from "@/lib/github/board-sync-schema";
import { boardNodeArraySchema, boardNodeSchema, boardSchema } from "@/lib/validation/board";

async function resolveLinkedSelection(
  accessToken: string,
  board: ReturnType<typeof boardSchema.parse>,
): Promise<GitHubConnectedPullRequestRequest> {
  if (
    board.source_type !== "GITHUB_PR" ||
    !board.github_owner ||
    !board.github_repository ||
    !board.github_pull_request_number
  ) {
    throw new GitHubImportError(
      "BOARD_NOT_LINKED",
      "Select a pull request before syncing this board.",
      409,
    );
  }

  const { repositories } = await listGitHubAccessibleRepositories(accessToken);
  const fullName = `${board.github_owner}/${board.github_repository}`.toLowerCase();
  const repository = repositories.find(
    (candidate) => candidate.fullName.toLowerCase() === fullName,
  );
  if (!repository) {
    throw new GitHubImportError(
      "REPOSITORY_ACCESS_DENIED",
      "The connected GitHub account can no longer access this board's repository.",
      403,
    );
  }

  return {
    installationId: repository.installationId,
    repositoryId: repository.repositoryId,
    owner: repository.owner,
    repository: repository.name,
    pullNumber: board.github_pull_request_number,
  };
}

function assertSamePullRequest(
  board: ReturnType<typeof boardSchema.parse>,
  selection: GitHubConnectedPullRequestRequest,
) {
  if (board.source_type !== "GITHUB_PR") return;
  const sameRepository =
    board.github_owner?.toLowerCase() === selection.owner.toLowerCase() &&
    board.github_repository?.toLowerCase() === selection.repository.toLowerCase();
  if (sameRepository && board.github_pull_request_number === selection.pullNumber) return;

  throw new GitHubImportError(
    "BOARD_ALREADY_LINKED",
    "This board is already linked to another pull request.",
    409,
  );
}

export async function syncConnectedGitHubBoard(input: {
  accessToken: string;
  boardId: string;
  selection?: GitHubConnectedPullRequestRequest;
  now?: string;
}): Promise<GitHubBoardSyncResponse> {
  const supabase = getSupabaseServerClient();

  try {
    const { data: boardRow, error: boardError } = await supabase
      .from("boards")
      .select("*")
      .eq("id", input.boardId)
      .single();
    if (boardError) {
      throw new GitHubImportError("BOARD_NOT_FOUND", "The board could not be found.", 404);
    }
    const board = boardSchema.parse(boardRow);
    const selection = input.selection ?? (await resolveLinkedSelection(input.accessToken, board));
    assertSamePullRequest(board, selection);

    const { repository, pullRequest } = await fetchConnectedGitHubPullRequest(
      input.accessToken,
      selection,
    );
    if (repository.isPrivate) {
      throw new GitHubImportError(
        "PRIVATE_REPOSITORY_UNSAFE",
        "Private repository imports are disabled while CodeLens boards use public prototype access policies.",
        403,
      );
    }
    if (repository.isArchived) {
      throw new GitHubImportError(
        "ARCHIVED_REPOSITORY",
        "Archived repositories cannot be linked for review.",
        409,
      );
    }

    const now = input.now ?? new Date().toISOString();
    const { data: nodeRows, error: nodesError } = await supabase
      .from("board_nodes")
      .select("*")
      .eq("board_id", input.boardId)
      .order("z_index", { ascending: true });
    if (nodesError) {
      throw new GitHubImportError(
        "BOARD_NODES_UNAVAILABLE",
        "Could not inspect existing board nodes before syncing.",
        502,
      );
    }
    const nodes = boardNodeArraySchema.parse(nodeRows ?? []);
    const staleResult = markOldGitHubImportedNodesStale(nodes, {
      boardId: input.boardId,
      repository: pullRequest.repositoryFullName,
      pullRequestNumber: pullRequest.pullNumber,
      headCommitSha: pullRequest.headCommitSha,
      staleAt: now,
    });
    const staleRecords = staleResult.records.filter((record) =>
      staleResult.staleNodeIds.includes(record.id),
    );
    const savedStaleNodes = await Promise.all(
      staleRecords.map(async (record) => {
        const { data, error } = await supabase
          .from("board_nodes")
          .update({ content: record.content })
          .eq("id", record.id)
          .eq("board_id", input.boardId)
          .select()
          .single();
        if (error) {
          throw new GitHubImportError(
            "STALE_NODE_UPDATE_FAILED",
            `Could not mark ${record.content.kind === "code" ? record.content.filename : "a node"} as stale.`,
            502,
          );
        }
        return boardNodeSchema.parse(data);
      }),
    );

    const [owner, repositoryName] = pullRequest.repositoryFullName.split("/");
    if (!owner || !repositoryName) {
      throw new GitHubImportError(
        "MALFORMED_RESPONSE",
        "GitHub returned an invalid repository name.",
        502,
      );
    }
    const wasSamePullRequest =
      board.source_type === "GITHUB_PR" &&
      board.github_owner?.toLowerCase() === owner.toLowerCase() &&
      board.github_repository?.toLowerCase() === repositoryName.toLowerCase() &&
      board.github_pull_request_number === pullRequest.pullNumber;
    const headChanged = Boolean(
      wasSamePullRequest &&
      board.github_head_sha &&
      board.github_head_sha.toLowerCase() !== pullRequest.headCommitSha.toLowerCase(),
    );
    const { data: savedBoardRow, error: saveBoardError } = await supabase
      .from("boards")
      .update({
        source_type: "GITHUB_PR",
        github_owner: owner,
        github_repository: repositoryName,
        github_pull_request_number: pullRequest.pullNumber,
        github_pull_request_url: pullRequest.htmlUrl,
        github_base_branch: pullRequest.baseBranch,
        github_head_branch: pullRequest.headBranch,
        github_base_sha: pullRequest.baseCommitSha,
        github_head_sha: pullRequest.headCommitSha,
        github_author_login: pullRequest.authorLogin,
        github_pull_request_title: pullRequest.title,
        github_pull_request_description: pullRequest.description,
        github_changed_file_count: pullRequest.changedFileCount,
        github_last_synced_at: now,
        ...(headChanged
          ? {
              preview_url: null,
              preview_deployment_id: null,
              preview_deployment_status: "NOT_FOUND",
              preview_commit_sha: pullRequest.headCommitSha,
              preview_branch: pullRequest.headBranch,
              preview_last_checked_at: null,
              preview_failure_reason:
                "The pull-request head changed. Refresh preview deployment discovery.",
            }
          : {}),
      })
      .eq("id", input.boardId)
      .select()
      .single();
    if (saveBoardError) {
      throw new GitHubImportError(
        "BOARD_LINK_FAILED",
        "Could not save the pull-request link on this board.",
        502,
      );
    }

    return githubBoardSyncResponseSchema.parse({
      board: boardSchema.parse(savedBoardRow),
      repository,
      pullRequest,
      headChanged,
      staleNodes: savedStaleNodes,
    });
  } catch (error) {
    throw asGitHubImportError(error);
  }
}
