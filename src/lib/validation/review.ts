import { z } from "zod";

export const threadStatusSchema = z.enum(["OPEN", "RESOLVED"]);
export const commentBodySchema = z.string().trim().min(1).max(10_000);

export const commentThreadSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  annotationId: z.string().uuid(),
  status: threadStatusSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  resolvedBy: z.string().min(1).nullable(),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
});

export const reviewCommentSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  threadId: z.string().uuid(),
  authorId: z.string().min(1),
  authorName: z.string().trim().min(1).max(120),
  body: commentBodySchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const reviewThreadSchema = commentThreadSchema.extend({
  comments: z.array(reviewCommentSchema),
  latestActivityAt: z.string().datetime({ offset: true }),
});

export const commentThreadDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  annotation_id: z.string().uuid(),
  status: threadStatusSchema,
  created_by: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  resolved_by: z.string().min(1).nullable(),
  resolved_at: z.string().datetime({ offset: true }).nullable(),
});

export const reviewCommentDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  author_id: z.string().min(1),
  author_name: z.string().trim().min(1).max(120),
  body: commentBodySchema,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type ThreadStatus = z.infer<typeof threadStatusSchema>;
export type CommentThread = z.infer<typeof commentThreadSchema>;
export type ReviewComment = z.infer<typeof reviewCommentSchema>;
export type ReviewThread = z.infer<typeof reviewThreadSchema>;
export type CommentThreadDatabaseRow = z.infer<typeof commentThreadDatabaseRowSchema>;
export type ReviewCommentDatabaseRow = z.infer<typeof reviewCommentDatabaseRowSchema>;

export function commentThreadFromDatabaseRow(input: unknown): CommentThread {
  const row = commentThreadDatabaseRowSchema.parse(input);
  return commentThreadSchema.parse({
    id: row.id,
    boardId: row.board_id,
    annotationId: row.annotation_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
  });
}

export function commentThreadToDatabaseRow(input: CommentThread): CommentThreadDatabaseRow {
  const thread = commentThreadSchema.parse(input);
  return commentThreadDatabaseRowSchema.parse({
    id: thread.id,
    board_id: thread.boardId,
    annotation_id: thread.annotationId,
    status: thread.status,
    created_by: thread.createdBy,
    created_at: thread.createdAt,
    updated_at: thread.updatedAt,
    resolved_by: thread.resolvedBy,
    resolved_at: thread.resolvedAt,
  });
}

export function reviewCommentFromDatabaseRow(input: unknown): ReviewComment {
  const row = reviewCommentDatabaseRowSchema.parse(input);
  return reviewCommentSchema.parse({
    id: row.id,
    boardId: row.board_id,
    threadId: row.thread_id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function reviewCommentToDatabaseRow(input: ReviewComment): ReviewCommentDatabaseRow {
  const comment = reviewCommentSchema.parse(input);
  return reviewCommentDatabaseRowSchema.parse({
    id: comment.id,
    board_id: comment.boardId,
    thread_id: comment.threadId,
    author_id: comment.authorId,
    author_name: comment.authorName,
    body: comment.body,
    created_at: comment.createdAt,
    updated_at: comment.updatedAt,
  });
}
