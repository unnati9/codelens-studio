import { describe, expect, it } from "vitest";
import {
  buildImportedCodeNodeRecords,
  createDeterministicNodePlacements,
  createGitHubSourceKey,
  detectCodeLanguage,
  isDefaultGitHubFileSelected,
  normalizeImportedDiffContent,
} from "./import";
import { githubChangedFileSchema, githubPullRequestSchema } from "./schema";
import { boardNodeSchema, type BoardNodeRecord } from "@/lib/validation/board";

const boardId = "40ad7bd7-b5f4-4374-8c77-15219478ce2b";
const pullRequest = githubPullRequestSchema.parse({
  repositoryFullName: "octocat/Hello-World",
  pullNumber: 42,
  title: "Add review canvas",
  description: null,
  authorLogin: "octocat",
  authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  state: "OPEN",
  baseBranch: "main",
  baseCommitSha: "fedcba9876543210fedcba9876543210fedcba98",
  headBranch: "feature/review",
  headCommitSha: "0123456789abcdef0123456789abcdef01234567",
  htmlUrl: "https://github.com/octocat/Hello-World/pull/42",
  additions: 18,
  deletions: 4,
  changedFileCount: 2,
  files: [],
  truncated: false,
  fileLimit: 300,
  importLimit: 20,
  unusuallyLarge: false,
});

function file(filename: string, patch: string | null = "@@ -1 +1 @@\n-old\n+new") {
  return githubChangedFileSchema.parse({
    filename,
    previousFilename: null,
    status: "modified",
    additions: 1,
    deletions: 1,
    changes: 2,
    patch,
    rawUrl: null,
    blobUrl: `https://github.com/octocat/Hello-World/blob/sha/${filename}`,
  });
}

const existingNode: BoardNodeRecord = boardNodeSchema.parse({
  id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  board_id: boardId,
  type: "code",
  title: "Existing",
  position_x: 100,
  position_y: 120,
  width: 500,
  height: 360,
  z_index: 1,
  locked: false,
  content: { kind: "code", filename: "manual.ts", language: "typescript", code: "manual" },
  created_by: "guest-1",
  created_at: "2026-07-19T08:00:00.000Z",
  updated_at: "2026-07-19T08:00:00.000Z",
});

describe("GitHub file import utilities", () => {
  it.each([
    ["component.tsx", "typescript"],
    ["script.mjs", "javascript"],
    ["styles.scss", "css"],
    ["index.html", "html"],
    ["config.json", "json"],
    ["service.py", "text"],
  ] as const)("detects %s as %s", (filename, language) => {
    expect(detectCodeLanguage(filename)).toBe(language);
  });

  it("selects source files but not lock, generated, or binary files by default", () => {
    expect(isDefaultGitHubFileSelected(file("src/component.tsx"))).toBe(true);
    expect(isDefaultGitHubFileSelected(file("package-lock.json"))).toBe(false);
    expect(isDefaultGitHubFileSelected(file("dist/app.min.js"))).toBe(false);
    expect(isDefaultGitHubFileSelected(file("public/logo.png", null))).toBe(false);
  });

  it("creates a stable source key", () => {
    const input = {
      boardId,
      repository: "octocat/Hello-World",
      pullRequestNumber: 42,
      headCommitSha: pullRequest.headCommitSha,
      filename: "src/component.tsx",
    };
    expect(createGitHubSourceKey(input)).toBe(createGitHubSourceKey(input));
    expect(createGitHubSourceKey(input)).toContain(`${boardId}:octocat/hello-world:42`);
  });

  it("creates useful content when GitHub omits a patch", () => {
    const content = normalizeImportedDiffContent(file("src/large.ts", null), pullRequest.htmlUrl);
    expect(content).toContain("Diff preview unavailable");
    expect(content).toContain("View on GitHub:");
  });

  it("creates deterministic non-overlapping placements to the right of existing nodes", () => {
    const first = createDeterministicNodePlacements([existingNode], 3);
    const second = createDeterministicNodePlacements([existingNode], 3);
    expect(first).toEqual(second);
    expect(first[0].x).toBeGreaterThan(existingNode.position_x + existingNode.width);
    expect(new Set(first.map((position) => `${position.x},${position.y}`)).size).toBe(3);
  });

  it("validates imported node data with the existing node schema", () => {
    const selectedFile = file("src/component.tsx");
    const { records } = buildImportedCodeNodeRecords({
      boardId,
      guestId: "guest-1",
      pullRequest: { ...pullRequest, files: [selectedFile] },
      selectedFiles: [selectedFile],
      existingNodes: [existingNode],
      importedAt: "2026-07-19T09:00:00.000Z",
    });
    expect(boardNodeSchema.parse(records[0]).content).toMatchObject({
      kind: "code",
      filename: "src/component.tsx",
      source: { sourceType: "GITHUB_PR", patchAvailable: true },
    });
    expect(records[0].content).toMatchObject({
      source: {
        isStale: false,
        staleAt: null,
        latestHeadCommitSha: pullRequest.headCommitSha,
      },
    });
  });

  it("skips a duplicate source key instead of creating another node", () => {
    const selectedFile = file("src/component.tsx");
    const first = buildImportedCodeNodeRecords({
      boardId,
      guestId: "guest-1",
      pullRequest: { ...pullRequest, files: [selectedFile] },
      selectedFiles: [selectedFile],
      existingNodes: [existingNode],
      importedAt: "2026-07-19T09:00:00.000Z",
    });
    const second = buildImportedCodeNodeRecords({
      boardId,
      guestId: "guest-1",
      pullRequest: { ...pullRequest, files: [selectedFile] },
      selectedFiles: [selectedFile],
      existingNodes: [existingNode, first.records[0]],
      importedAt: "2026-07-19T09:05:00.000Z",
    });
    expect(second.records).toHaveLength(0);
    expect(second.skippedFiles.map((candidate) => candidate.filename)).toEqual([
      "src/component.tsx",
    ]);
  });
});
