import { afterEach, describe, expect, it } from "vitest";
import { serializeBoardNode } from "@/lib/nodes/serialization";
import { shouldApplyVersionedRecord } from "@/lib/realtime/versioning";
import type { Annotation } from "@/lib/validation/annotation";
import type { Board, BoardNodeRecord } from "@/lib/validation/board";
import type { CommentThread, ReviewComment } from "@/lib/validation/review";
import { useAnnotationStore } from "@/stores/annotation-store";
import { useBoardStore } from "@/stores/board-store";
import { useReviewStore } from "@/stores/review-store";

const boardId = "40ad7bd7-b5f4-4374-8c77-15219478ce2b";
const nodeId = "a9c28c6e-34e3-49d1-b6ea-258b2487f414";
const annotationId = "e76c4401-f56c-42a7-a2c1-8a79da8645d3";
const threadId = "9baad3f7-29e6-4921-b48b-b49f2d88ad5e";

const importedNode: BoardNodeRecord = {
  id: nodeId,
  board_id: boardId,
  type: "code",
  title: "src/review.ts",
  position_x: 120,
  position_y: 80,
  width: 480,
  height: 360,
  z_index: 1,
  locked: false,
  content: {
    kind: "code",
    filename: "src/review.ts",
    language: "typescript",
    code: "@@ -1 +1 @@\n-false\n+true",
    source: {
      sourceType: "GITHUB_PR",
      sourceKey: `${boardId}:openai/codelens:14:abcdef1:src/review.ts`,
      repository: "openai/codelens",
      pullRequestNumber: 14,
      headCommitSha: "abcdef1234567",
      filePath: "src/review.ts",
      previousFilePath: null,
      fileStatus: "modified",
      additions: 1,
      deletions: 1,
      blobUrl: "https://github.com/openai/codelens/blob/abcdef1/src/review.ts",
      rawUrl: null,
      pullRequestUrl: "https://github.com/openai/codelens/pull/14",
      patchAvailable: true,
      importedAt: "2026-07-19T09:00:00.000Z",
      isStale: false,
      staleAt: null,
      latestHeadCommitSha: "abcdef1234567",
    },
  },
  created_by: "guest-1",
  created_at: "2026-07-19T09:00:00.000Z",
  updated_at: "2026-07-19T09:00:00.000Z",
};

const annotation: Annotation = {
  id: annotationId,
  boardId,
  targetType: "NODE",
  targetNodeId: nodeId,
  tool: "RECTANGLE",
  geometry: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
  style: { stroke: "#ff5a36", strokeWidth: 4, opacity: 0.9 },
  createdBy: "guest-1",
  createdAt: "2026-07-19T09:01:00.000Z",
  updatedAt: "2026-07-19T09:01:00.000Z",
};

const thread: CommentThread = {
  id: threadId,
  boardId,
  annotationId,
  status: "OPEN",
  createdBy: "guest-1",
  createdAt: "2026-07-19T09:02:00.000Z",
  updatedAt: "2026-07-19T09:02:00.000Z",
  resolvedBy: null,
  resolvedAt: null,
};

afterEach(() => {
  useBoardStore.getState().initialize(boardId, []);
  useAnnotationStore.getState().initialize(boardId, []);
  useReviewStore.getState().initialize(boardId, []);
});

describe("mocked two-client realtime reconciliation", () => {
  it("synchronizes move and resize changes in both directions for a GitHub code node", () => {
    const movedByClientA = {
      ...importedNode,
      position_x: 360,
      position_y: 220,
      updated_at: "2026-07-19T09:03:00.000Z",
    };
    useBoardStore.getState().initialize(boardId, [importedNode]);
    useBoardStore.getState().upsertRemoteRecord(movedByClientA);
    expect(serializeBoardNode(useBoardStore.getState().nodes[0])).toMatchObject({
      position_x: 360,
      position_y: 220,
      content: { source: { sourceType: "GITHUB_PR" } },
    });

    const resizedByClientB = {
      ...movedByClientA,
      width: 720,
      height: 520,
      updated_at: "2026-07-19T09:04:00.000Z",
    };
    useBoardStore.getState().initialize(boardId, [movedByClientA]);
    useBoardStore.getState().upsertRemoteRecord(resizedByClientB);
    expect(serializeBoardNode(useBoardStore.getState().nodes[0])).toMatchObject({
      position_x: 360,
      position_y: 220,
      width: 720,
      height: 520,
    });
  });

  it("synchronizes annotation creation, update, and deletion", () => {
    useAnnotationStore.getState().initialize(boardId, []);
    useAnnotationStore.getState().upsertRemote(annotation);
    expect(useAnnotationStore.getState().annotations).toEqual([annotation]);

    const updated = {
      ...annotation,
      style: { ...annotation.style, stroke: "#00aa55" },
      updatedAt: "2026-07-19T09:05:00.000Z",
    };
    useAnnotationStore.getState().upsertRemote(updated);
    expect(useAnnotationStore.getState().annotations[0].style.stroke).toBe("#00aa55");
    useAnnotationStore.getState().deleteRemote(annotationId);
    expect(useAnnotationStore.getState().annotations).toEqual([]);
  });

  it("handles comment-before-thread ordering plus resolve and reopen", () => {
    const comment: ReviewComment = {
      id: "6a17bb87-f39c-45d5-aa58-e2d8e6e68714",
      boardId,
      threadId,
      authorId: "guest-2",
      authorName: "Steady Builder 27",
      body: "Updated in the other session.",
      createdAt: "2026-07-19T09:03:00.000Z",
      updatedAt: "2026-07-19T09:03:00.000Z",
    };
    useReviewStore.getState().initialize(boardId, []);
    useReviewStore.getState().upsertRemoteComment(comment);
    expect(useReviewStore.getState().pendingComments).toEqual([comment]);
    useReviewStore.getState().upsertRemoteThread(thread);
    expect(useReviewStore.getState().threads[0].comments).toEqual([comment]);

    useReviewStore.getState().upsertRemoteThread({
      ...thread,
      status: "RESOLVED",
      resolvedBy: "guest-2",
      resolvedAt: "2026-07-19T09:04:00.000Z",
      updatedAt: "2026-07-19T09:04:00.000Z",
    });
    expect(useReviewStore.getState().threads[0].status).toBe("RESOLVED");

    useReviewStore.getState().upsertRemoteThread({
      ...thread,
      updatedAt: "2026-07-19T09:05:00.000Z",
    });
    expect(useReviewStore.getState().threads[0].status).toBe("OPEN");
  });

  it("applies board review status changes in both directions by server timestamp", () => {
    const draft: Board = {
      id: boardId,
      title: "Review board",
      description: null,
      status: "DRAFT",
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
      created_by: "guest-1",
      created_at: "2026-07-19T09:00:00.000Z",
      updated_at: "2026-07-19T09:00:00.000Z",
    };
    const inReview = {
      ...draft,
      status: "IN_REVIEW" as const,
      updated_at: "2026-07-19T09:01:00.000Z",
    };
    const approved = {
      ...inReview,
      status: "APPROVED" as const,
      updated_at: "2026-07-19T09:02:00.000Z",
    };

    let clientB = draft;
    if (shouldApplyVersionedRecord(clientB, inReview)) clientB = inReview;
    expect(clientB.status).toBe("IN_REVIEW");
    let clientA: Board = inReview;
    if (shouldApplyVersionedRecord(clientA, approved)) clientA = approved;
    expect(clientA.status).toBe("APPROVED");
  });
});
