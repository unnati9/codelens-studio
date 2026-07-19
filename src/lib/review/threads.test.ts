import { describe, expect, it } from "vitest";
import {
  createCommentDraft,
  createCommentThreadDraft,
  getThreadCounts,
  groupCommentsByThread,
  transitionCommentThreadStatus,
} from "./threads";

const boardId = "40ad7bd7-b5f4-4374-8c77-15219478ce2b";
const firstAnnotationId = "a9c28c6e-34e3-49d1-b6ea-258b2487f414";
const secondAnnotationId = "7af49293-baa1-4dbd-a08c-768f5bf14fe8";
const firstThreadId = "f29a15b2-aa17-4ada-aa55-4ce21eb6152b";
const secondThreadId = "0cb8e43b-c9f7-49b5-a317-3282465a803b";

function makeThread(
  id = firstThreadId,
  annotationId = firstAnnotationId,
  now = "2026-07-18T09:00:00.000Z",
) {
  return createCommentThreadDraft({
    id,
    boardId,
    annotationId,
    guestId: "guest-1",
    now,
  });
}

describe("review thread model", () => {
  it("creates a thread linked to its annotation", () => {
    expect(makeThread()).toMatchObject({
      boardId,
      annotationId: firstAnnotationId,
      status: "OPEN",
    });
  });

  it("groups comments by thread and sorts messages chronologically", () => {
    const early = createCommentDraft({
      id: "6a17bb87-f39c-45d5-aa58-e2d8e6e68714",
      boardId,
      threadId: firstThreadId,
      authorId: "guest-1",
      authorName: "Brisk Reviewer",
      body: "First",
      now: "2026-07-18T09:01:00.000Z",
    });
    const late = createCommentDraft({
      id: "b36a1472-c523-4e23-88cd-033452afc2fb",
      boardId,
      threadId: firstThreadId,
      authorId: "guest-2",
      authorName: "Calm Builder",
      body: "Second",
      now: "2026-07-18T09:02:00.000Z",
    });

    const [grouped] = groupCommentsByThread([makeThread()], [late, early]);
    expect(grouped.comments.map((comment) => comment.body)).toEqual(["First", "Second"]);
    expect(grouped.latestActivityAt).toBe(late.updatedAt);
  });

  it("resolves an open thread", () => {
    const [thread] = groupCommentsByThread([makeThread()], []);
    const resolved = transitionCommentThreadStatus(
      thread,
      "RESOLVED",
      "guest-2",
      "2026-07-18T09:05:00.000Z",
    );

    expect(resolved).toMatchObject({
      status: "RESOLVED",
      resolvedBy: "guest-2",
      resolvedAt: "2026-07-18T09:05:00.000Z",
    });
  });

  it("reopens a resolved thread", () => {
    const [thread] = groupCommentsByThread([makeThread()], []);
    const resolved = transitionCommentThreadStatus(thread, "RESOLVED", "guest-2");
    const reopened = transitionCommentThreadStatus(
      resolved,
      "OPEN",
      "guest-1",
      "2026-07-18T09:06:00.000Z",
    );

    expect(reopened).toMatchObject({ status: "OPEN", resolvedBy: null, resolvedAt: null });
  });

  it("counts open and resolved threads", () => {
    const [openThread] = groupCommentsByThread([makeThread()], []);
    const [anotherOpen] = groupCommentsByThread(
      [makeThread(secondThreadId, secondAnnotationId)],
      [],
    );
    const resolved = transitionCommentThreadStatus(anotherOpen, "RESOLVED", "guest-1");

    expect(getThreadCounts([openThread, resolved])).toEqual({ open: 1, resolved: 1 });
  });

  it("sorts threads by latest activity", () => {
    const older = makeThread(firstThreadId, firstAnnotationId, "2026-07-18T09:00:00.000Z");
    const newer = makeThread(secondThreadId, secondAnnotationId, "2026-07-18T10:00:00.000Z");

    expect(groupCommentsByThread([older, newer], []).map((thread) => thread.id)).toEqual([
      secondThreadId,
      firstThreadId,
    ]);
  });
});
