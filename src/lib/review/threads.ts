import {
  commentBodySchema,
  commentThreadSchema,
  reviewCommentSchema,
  reviewThreadSchema,
  type CommentThread,
  type ReviewComment,
  type ReviewThread,
  type ThreadStatus,
} from "@/lib/validation/review";

export function createCommentThreadDraft(input: {
  boardId: string;
  annotationId: string;
  guestId: string;
  id?: string;
  now?: string;
}): CommentThread {
  const now = input.now ?? new Date().toISOString();
  return commentThreadSchema.parse({
    id: input.id ?? crypto.randomUUID(),
    boardId: input.boardId,
    annotationId: input.annotationId,
    status: "OPEN",
    createdBy: input.guestId,
    createdAt: now,
    updatedAt: now,
    resolvedBy: null,
    resolvedAt: null,
  });
}

export function createCommentDraft(input: {
  threadId: string;
  authorId: string;
  authorName: string;
  body: string;
  id?: string;
  now?: string;
}): ReviewComment {
  const now = input.now ?? new Date().toISOString();
  return reviewCommentSchema.parse({
    id: input.id ?? crypto.randomUUID(),
    threadId: input.threadId,
    authorId: input.authorId,
    authorName: input.authorName,
    body: commentBodySchema.parse(input.body),
    createdAt: now,
    updatedAt: now,
  });
}

function activityTimestamp(thread: CommentThread, comments: ReviewComment[]): string {
  return comments.reduce(
    (latest, comment) =>
      Date.parse(comment.updatedAt) > Date.parse(latest) ? comment.updatedAt : latest,
    thread.updatedAt,
  );
}

export function sortThreadsByActivity(threads: ReviewThread[]): ReviewThread[] {
  return [...threads].sort(
    (left, right) => Date.parse(right.latestActivityAt) - Date.parse(left.latestActivityAt),
  );
}

export function groupCommentsByThread(
  threads: CommentThread[],
  comments: ReviewComment[],
): ReviewThread[] {
  const commentsByThread = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const group = commentsByThread.get(comment.threadId) ?? [];
    group.push(reviewCommentSchema.parse(comment));
    commentsByThread.set(comment.threadId, group);
  }

  return sortThreadsByActivity(
    threads.map((thread) => {
      const threadComments = (commentsByThread.get(thread.id) ?? []).sort(
        (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
      );
      return reviewThreadSchema.parse({
        ...thread,
        comments: threadComments,
        latestActivityAt: activityTimestamp(thread, threadComments),
      });
    }),
  );
}

export function getThreadCounts(threads: ReviewThread[]): {
  open: number;
  resolved: number;
} {
  return threads.reduce(
    (counts, thread) => {
      if (thread.status === "OPEN") counts.open += 1;
      else counts.resolved += 1;
      return counts;
    },
    { open: 0, resolved: 0 },
  );
}

export function transitionCommentThreadStatus(
  thread: ReviewThread,
  status: ThreadStatus,
  actorId: string,
  now = new Date().toISOString(),
): ReviewThread {
  return reviewThreadSchema.parse({
    ...thread,
    status,
    updatedAt: now,
    latestActivityAt: now,
    resolvedBy: status === "RESOLVED" ? actorId : null,
    resolvedAt: status === "RESOLVED" ? now : null,
  });
}
