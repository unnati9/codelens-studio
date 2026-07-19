import type { BoardNodeRecord } from "@/lib/validation/board";

export type GitHubImportedNodeRevision = {
  boardId: string;
  repository: string;
  pullRequestNumber: number;
  headCommitSha: string;
};

export type GitHubImportedNodeRevisionClassification =
  "MANUAL" | "OTHER_BOARD" | "OTHER_PULL_REQUEST" | "CURRENT_HEAD" | "OLD_HEAD";

export function classifyGitHubImportedNodeRevision(
  node: BoardNodeRecord,
  revision: GitHubImportedNodeRevision,
): GitHubImportedNodeRevisionClassification {
  if (node.content.kind !== "code" || !node.content.source) return "MANUAL";
  if (node.board_id !== revision.boardId) return "OTHER_BOARD";

  const source = node.content.source;
  if (
    source.repository.toLowerCase() !== revision.repository.toLowerCase() ||
    source.pullRequestNumber !== revision.pullRequestNumber
  ) {
    return "OTHER_PULL_REQUEST";
  }

  return source.headCommitSha.toLowerCase() === revision.headCommitSha.toLowerCase()
    ? "CURRENT_HEAD"
    : "OLD_HEAD";
}

export function markOldGitHubImportedNodesStale(
  nodes: BoardNodeRecord[],
  revision: GitHubImportedNodeRevision & { staleAt: string },
): { records: BoardNodeRecord[]; staleNodeIds: string[] } {
  const staleNodeIds: string[] = [];
  const records = nodes.map((node) => {
    if (classifyGitHubImportedNodeRevision(node, revision) !== "OLD_HEAD") return node;
    if (node.content.kind !== "code" || !node.content.source) return node;

    const source = node.content.source;
    const alreadyMarkedForRevision =
      source.isStale &&
      source.latestHeadCommitSha?.toLowerCase() === revision.headCommitSha.toLowerCase();
    if (alreadyMarkedForRevision) return node;

    staleNodeIds.push(node.id);
    return {
      ...node,
      content: {
        ...node.content,
        source: {
          ...source,
          isStale: true,
          staleAt: source.staleAt ?? revision.staleAt,
          latestHeadCommitSha: revision.headCommitSha,
        },
      },
      updated_at: revision.staleAt,
    };
  });

  return { records, staleNodeIds };
}
