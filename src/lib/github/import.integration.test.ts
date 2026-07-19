import { describe, expect, it } from "vitest";
import { annotationSchema } from "@/lib/validation/annotation";
import {
  createCommentDraft,
  createCommentThreadDraft,
  groupCommentsByThread,
  transitionCommentThreadStatus,
} from "@/lib/review/threads";
import { deserializeBoardNode, serializeBoardNode } from "@/lib/nodes/serialization";
import { buildImportedCodeNodeRecords } from "./import";
import { githubChangedFileSchema, githubPullRequestSchema } from "./schema";

const boardId = "40ad7bd7-b5f4-4374-8c77-15219478ce2b";
const nodeIdThread = "f29a15b2-aa17-4ada-aa55-4ce21eb6152b";

const changedFile = githubChangedFileSchema.parse({
  filename: "src/imported.ts",
  previousFilename: null,
  status: "added",
  additions: 2,
  deletions: 0,
  changes: 2,
  patch: "@@ -0,0 +1,2 @@\n+export const imported = true;\n+export default imported;",
  rawUrl: null,
  blobUrl: "https://github.com/octocat/Hello-World/blob/sha/src/imported.ts",
});

const unselectedFile = githubChangedFileSchema.parse({
  ...changedFile,
  filename: "src/not-selected.ts",
  blobUrl: "https://github.com/octocat/Hello-World/blob/sha/src/not-selected.ts",
});

const pullRequest = githubPullRequestSchema.parse({
  repositoryFullName: "octocat/Hello-World",
  pullNumber: 42,
  title: "Import one file",
  description: null,
  authorLogin: "octocat",
  authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  state: "OPEN",
  baseBranch: "main",
  headBranch: "feature/import",
  headCommitSha: "0123456789abcdef0123456789abcdef01234567",
  htmlUrl: "https://github.com/octocat/Hello-World/pull/42",
  additions: 2,
  deletions: 0,
  changedFileCount: 2,
  files: [changedFile, unselectedFile],
  truncated: false,
  fileLimit: 300,
  importLimit: 20,
  unusuallyLarge: false,
});

describe("GitHub import integration with existing review models", () => {
  it("imports selected files and survives node serialization and reload", () => {
    const { records } = buildImportedCodeNodeRecords({
      boardId,
      guestId: "guest-1",
      pullRequest,
      selectedFiles: [changedFile],
      existingNodes: [],
      importedAt: "2026-07-19T09:00:00.000Z",
    });
    const reloaded = serializeBoardNode(deserializeBoardNode(records[0]));
    expect(records).toHaveLength(1);
    expect(records[0].content).toMatchObject({ filename: "src/imported.ts" });
    expect(reloaded.content).toEqual(records[0].content);
    expect(reloaded.position_x).toBe(records[0].position_x);
    expect(reloaded.position_y).toBe(records[0].position_y);
  });

  it("supports a node-relative annotation and linked comment on an imported node", () => {
    const [{ records }] = [
      buildImportedCodeNodeRecords({
        boardId,
        guestId: "guest-1",
        pullRequest,
        selectedFiles: [changedFile],
        existingNodes: [],
        importedAt: "2026-07-19T09:00:00.000Z",
      }),
    ];
    const importedNode = records[0];
    const annotation = annotationSchema.parse({
      id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
      boardId,
      targetType: "NODE",
      targetNodeId: importedNode.id,
      tool: "RECTANGLE",
      geometry: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
      style: { stroke: "#ff5a36", strokeWidth: 4, opacity: 0.9 },
      createdBy: "guest-1",
      createdAt: "2026-07-19T09:05:00.000Z",
      updatedAt: "2026-07-19T09:05:00.000Z",
    });
    const thread = createCommentThreadDraft({
      id: nodeIdThread,
      boardId,
      annotationId: annotation.id,
      guestId: "guest-1",
      now: "2026-07-19T09:06:00.000Z",
    });
    const comment = createCommentDraft({
      id: "6a17bb87-f39c-45d5-aa58-e2d8e6e68714",
      threadId: thread.id,
      authorId: "guest-1",
      authorName: "Brisk Reviewer",
      body: "Please review this imported line.",
      now: "2026-07-19T09:07:00.000Z",
    });
    const [reviewThread] = groupCommentsByThread([thread], [comment]);
    const resolved = transitionCommentThreadStatus(
      reviewThread,
      "RESOLVED",
      "guest-1",
      "2026-07-19T09:08:00.000Z",
    );

    expect(annotation.targetNodeId).toBe(importedNode.id);
    expect(reviewThread.annotationId).toBe(annotation.id);
    expect(reviewThread.comments[0].body).toContain("imported line");
    expect(resolved.status).toBe("RESOLVED");
  });
});
