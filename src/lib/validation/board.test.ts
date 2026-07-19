import { describe, expect, it } from "vitest";
import { boardNodeSchema, boardSchema, boardStatusSchema } from "./board";

const baseNode = {
  id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  board_id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
  type: "code",
  title: "Review service",
  position_x: 120,
  position_y: 80,
  width: 480,
  height: 360,
  z_index: 1,
  locked: false,
  content: {
    kind: "code",
    filename: "review.ts",
    language: "typescript",
    code: "export const review = true;",
  },
  created_by: "guest-1",
  created_at: "2026-07-18T09:00:00.000Z",
  updated_at: "2026-07-18T09:00:00.000Z",
};

describe("boardNodeSchema", () => {
  it("accepts a valid code node", () => {
    expect(boardNodeSchema.parse(baseNode)).toMatchObject({ type: "code", width: 480 });
  });

  it("rejects content that does not match the node type", () => {
    const result = boardNodeSchema.safeParse({
      ...baseNode,
      content: {
        kind: "image",
        storagePath: null,
        fileName: null,
        mimeType: null,
        sizeBytes: null,
        naturalWidth: null,
        naturalHeight: null,
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects dimensions below the canvas minimum", () => {
    expect(boardNodeSchema.safeParse({ ...baseNode, width: 120 }).success).toBe(false);
  });

  it("loads legacy GitHub code sources as current by default", () => {
    const parsed = boardNodeSchema.parse({
      ...baseNode,
      content: {
        ...baseNode.content,
        source: {
          sourceType: "GITHUB_PR",
          sourceKey: "github-pr:board:octocat/hello-world:42:abc1234:review.ts",
          repository: "octocat/Hello-World",
          pullRequestNumber: 42,
          headCommitSha: "abcdef1234567",
          filePath: "review.ts",
          previousFilePath: null,
          fileStatus: "modified",
          additions: 1,
          deletions: 1,
          blobUrl: null,
          rawUrl: null,
          pullRequestUrl: "https://github.com/octocat/Hello-World/pull/42",
          patchAvailable: true,
          importedAt: "2026-07-18T09:00:00.000Z",
        },
      },
    });

    expect(parsed.content).toMatchObject({
      source: { isStale: false, staleAt: null, latestHeadCommitSha: null },
    });
  });
});

describe("boardStatusSchema", () => {
  it("accepts a changes-requested review state", () => {
    expect(boardStatusSchema.parse("CHANGES_REQUESTED")).toBe("CHANGES_REQUESTED");
  });
});

describe("boardSchema source compatibility", () => {
  it("keeps manually created boards valid with nullable source metadata", () => {
    expect(
      boardSchema.parse({
        id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
        title: "Manual review board",
        description: null,
        status: "DRAFT",
        created_by: "guest-1",
        created_at: "2026-07-19T08:00:00.000Z",
        updated_at: "2026-07-19T08:00:00.000Z",
      }),
    ).toMatchObject({ title: "Manual review board", source_type: null });
  });

  it("allows linking a GitHub pull request before files are imported", () => {
    const linked = boardSchema.parse({
      id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
      title: "Pull request review",
      description: null,
      status: "DRAFT",
      source_type: "GITHUB_PR",
      github_owner: "octocat",
      github_repository: "Hello-World",
      github_pull_request_number: 42,
      github_pull_request_url: "https://github.com/octocat/Hello-World/pull/42",
      github_head_sha: "0123456789abcdef0123456789abcdef01234567",
      github_base_branch: "main",
      github_head_branch: "feature/review",
      github_base_sha: "abcdef0123456789abcdef0123456789abcdef01",
      github_author_login: "octocat",
      github_pull_request_title: "Add a review flow",
      github_pull_request_description: "Ready for review.",
      github_changed_file_count: 3,
      github_last_synced_at: "2026-07-19T09:00:00.000Z",
      last_imported_at: null,
      created_by: "guest-1",
      created_at: "2026-07-19T08:00:00.000Z",
      updated_at: "2026-07-19T09:00:00.000Z",
    });

    expect(linked).toMatchObject({
      source_type: "GITHUB_PR",
      last_imported_at: null,
      github_base_branch: "main",
      github_changed_file_count: 3,
    });
  });

  it("rejects a GitHub source without its stable pull-request identity", () => {
    const result = boardSchema.safeParse({
      id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
      title: "Incomplete pull request",
      description: null,
      status: "DRAFT",
      source_type: "GITHUB_PR",
      created_by: "guest-1",
      created_at: "2026-07-19T08:00:00.000Z",
      updated_at: "2026-07-19T08:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});
