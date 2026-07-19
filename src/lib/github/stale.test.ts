import { describe, expect, it } from "vitest";
import { boardNodeSchema, type BoardNodeRecord } from "@/lib/validation/board";
import { classifyGitHubImportedNodeRevision, markOldGitHubImportedNodesStale } from "./stale";

const boardId = "40ad7bd7-b5f4-4374-8c77-15219478ce2b";
const previousHead = "0123456789abcdef0123456789abcdef01234567";
const currentHead = "abcdef0123456789abcdef0123456789abcdef01";
const staleAt = "2026-07-19T10:00:00.000Z";

function codeNode(input: {
  id: string;
  boardId?: string;
  repository?: string;
  pullRequestNumber?: number;
  headCommitSha?: string;
  manual?: boolean;
}): BoardNodeRecord {
  return boardNodeSchema.parse({
    id: input.id,
    board_id: input.boardId ?? boardId,
    type: "code",
    title: "src/review.ts",
    position_x: 80,
    position_y: 80,
    width: 680,
    height: 500,
    z_index: 1,
    locked: false,
    content: {
      kind: "code",
      filename: "src/review.ts",
      language: "typescript",
      code: "@@ -1 +1 @@\n-old\n+new",
      ...(input.manual
        ? {}
        : {
            source: {
              sourceType: "GITHUB_PR",
              sourceKey: `${input.repository ?? "octocat/Hello-World"}:42:${input.headCommitSha ?? previousHead}:src/review.ts`,
              repository: input.repository ?? "octocat/Hello-World",
              pullRequestNumber: input.pullRequestNumber ?? 42,
              headCommitSha: input.headCommitSha ?? previousHead,
              filePath: "src/review.ts",
              previousFilePath: null,
              fileStatus: "modified",
              additions: 1,
              deletions: 1,
              blobUrl: null,
              rawUrl: null,
              pullRequestUrl: "https://github.com/octocat/Hello-World/pull/42",
              patchAvailable: true,
              importedAt: "2026-07-19T09:00:00.000Z",
            },
          }),
    },
    created_by: "guest-1",
    created_at: "2026-07-19T09:00:00.000Z",
    updated_at: "2026-07-19T09:00:00.000Z",
  });
}

const revision = {
  boardId,
  repository: "OCTOCAT/hello-world",
  pullRequestNumber: 42,
  headCommitSha: currentHead,
};

describe("GitHub imported node staleness", () => {
  it("classifies only an imported node from an older matching PR head as old", () => {
    expect(
      classifyGitHubImportedNodeRevision(
        codeNode({ id: "00000000-0000-4000-8000-000000000001" }),
        revision,
      ),
    ).toBe("OLD_HEAD");
    expect(
      classifyGitHubImportedNodeRevision(
        codeNode({
          id: "00000000-0000-4000-8000-000000000002",
          headCommitSha: currentHead,
        }),
        revision,
      ),
    ).toBe("CURRENT_HEAD");
    expect(
      classifyGitHubImportedNodeRevision(
        codeNode({ id: "00000000-0000-4000-8000-000000000003", manual: true }),
        revision,
      ),
    ).toBe("MANUAL");
  });

  it("marks matching old-head nodes while preserving manual, current, and other-PR nodes", () => {
    const oldHead = codeNode({ id: "00000000-0000-4000-8000-000000000011" });
    const manual = codeNode({ id: "00000000-0000-4000-8000-000000000012", manual: true });
    const current = codeNode({
      id: "00000000-0000-4000-8000-000000000013",
      headCommitSha: currentHead,
    });
    const otherPullRequest = codeNode({
      id: "00000000-0000-4000-8000-000000000014",
      pullRequestNumber: 43,
    });
    const otherRepository = codeNode({
      id: "00000000-0000-4000-8000-000000000015",
      repository: "octocat/Other",
    });

    const result = markOldGitHubImportedNodesStale(
      [oldHead, manual, current, otherPullRequest, otherRepository],
      { ...revision, staleAt },
    );

    expect(result.staleNodeIds).toEqual([oldHead.id]);
    expect(result.records[0]).toMatchObject({
      updated_at: staleAt,
      content: {
        source: {
          headCommitSha: previousHead,
          isStale: true,
          staleAt,
          latestHeadCommitSha: currentHead,
        },
      },
    });
    expect(result.records.slice(1)).toEqual([manual, current, otherPullRequest, otherRepository]);
  });

  it("does not rewrite a node already marked stale for the same latest head", () => {
    const oldHead = codeNode({ id: "00000000-0000-4000-8000-000000000021" });
    if (oldHead.content.kind !== "code" || !oldHead.content.source) {
      throw new Error("Expected an imported code node.");
    }
    const alreadyStale = boardNodeSchema.parse({
      ...oldHead,
      content: {
        ...oldHead.content,
        source: {
          ...oldHead.content.source,
          isStale: true,
          staleAt: "2026-07-19T09:30:00.000Z",
          latestHeadCommitSha: currentHead,
        },
      },
    });

    const result = markOldGitHubImportedNodesStale([alreadyStale], {
      ...revision,
      staleAt,
    });

    expect(result.staleNodeIds).toEqual([]);
    expect(result.records[0]).toBe(alreadyStale);
  });
});
