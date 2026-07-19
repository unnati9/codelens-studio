import { create } from "zustand";
import { sortThreadsByActivity } from "@/lib/review/threads";
import { latestUpdatedAt, shouldApplyVersionedRecord } from "@/lib/realtime/versioning";
import {
  reviewCommentSchema,
  reviewThreadSchema,
  type ReviewComment,
  type ReviewThread,
} from "@/lib/validation/review";

type ReviewStore = {
  boardId: string | null;
  threads: ReviewThread[];
  pendingComments: ReviewComment[];
  initialize: (boardId: string, threads: ReviewThread[]) => void;
  add: (thread: ReviewThread) => void;
  replace: (thread: ReviewThread) => void;
  addComment: (threadId: string, comment: ReviewComment) => void;
  upsertRemoteThread: (thread: Omit<ReviewThread, "comments" | "latestActivityAt">) => void;
  upsertRemoteComment: (comment: ReviewComment) => void;
  deleteRemoteThread: (threadId: string) => void;
  deleteRemoteComment: (commentId: string) => void;
  removeForAnnotation: (annotationId: string) => void;
  removeForAnnotations: (annotationIds: string[]) => void;
  getByAnnotation: (annotationId: string) => ReviewThread | null;
};

export const useReviewStore = create<ReviewStore>((set, get) => ({
  boardId: null,
  threads: [],
  pendingComments: [],
  initialize: (boardId, threads) =>
    set({
      boardId,
      threads: sortThreadsByActivity(threads.map((thread) => reviewThreadSchema.parse(thread))),
      pendingComments: [],
    }),
  add: (thread) =>
    set((state) => ({
      threads: sortThreadsByActivity(
        state.threads.some((candidate) => candidate.id === thread.id)
          ? state.threads.map((candidate) =>
              candidate.id === thread.id ? reviewThreadSchema.parse(thread) : candidate,
            )
          : [...state.threads, reviewThreadSchema.parse(thread)],
      ),
    })),
  replace: (thread) =>
    set((state) => ({
      threads: sortThreadsByActivity(
        state.threads.map((candidate) =>
          candidate.id === thread.id ? reviewThreadSchema.parse(thread) : candidate,
        ),
      ),
      pendingComments: state.pendingComments.filter((comment) => comment.threadId !== thread.id),
    })),
  addComment: (threadId, comment) =>
    set((state) => {
      const parsedComment = reviewCommentSchema.parse(comment);
      return {
        threads: sortThreadsByActivity(
          state.threads.map((thread) =>
            thread.id === threadId
              ? reviewThreadSchema.parse({
                  ...thread,
                  comments: (thread.comments.some((candidate) => candidate.id === parsedComment.id)
                    ? thread.comments.map((candidate) =>
                        candidate.id === parsedComment.id ? parsedComment : candidate,
                      )
                    : [...thread.comments, parsedComment]
                  ).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
                  latestActivityAt: parsedComment.updatedAt,
                })
              : thread,
          ),
        ),
      };
    }),
  upsertRemoteThread: (thread) =>
    set((state) => {
      if (state.boardId !== thread.boardId) return state;
      const existing = state.threads.find((candidate) => candidate.id === thread.id);
      if (existing && !shouldApplyVersionedRecord(existing, thread)) return state;
      const pending = state.pendingComments.filter((comment) => comment.threadId === thread.id);
      const comments = existing?.comments ?? pending;
      const nextThread = reviewThreadSchema.parse({
        ...thread,
        comments,
        latestActivityAt: latestUpdatedAt(comments, thread.updatedAt),
      });
      return {
        threads: sortThreadsByActivity(
          existing
            ? state.threads.map((candidate) =>
                candidate.id === thread.id ? nextThread : candidate,
              )
            : [...state.threads, nextThread],
        ),
        pendingComments: state.pendingComments.filter((comment) => comment.threadId !== thread.id),
      };
    }),
  upsertRemoteComment: (comment) =>
    set((state) => {
      const parsed = reviewCommentSchema.parse(comment);
      if (state.boardId !== parsed.boardId) return state;
      const thread = state.threads.find((candidate) => candidate.id === parsed.threadId);
      if (!thread) {
        const existing = state.pendingComments.find((candidate) => candidate.id === parsed.id);
        if (existing && !shouldApplyVersionedRecord(existing, parsed)) return state;
        return {
          pendingComments: existing
            ? state.pendingComments.map((candidate) =>
                candidate.id === parsed.id ? parsed : candidate,
              )
            : [...state.pendingComments, parsed],
        };
      }

      const existing = thread.comments.find((candidate) => candidate.id === parsed.id);
      if (existing && !shouldApplyVersionedRecord(existing, parsed)) return state;
      const comments = (
        existing
          ? thread.comments.map((candidate) => (candidate.id === parsed.id ? parsed : candidate))
          : [...thread.comments, parsed]
      ).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
      const nextThread = reviewThreadSchema.parse({
        ...thread,
        comments,
        latestActivityAt: latestUpdatedAt(comments, thread.updatedAt),
      });
      return {
        threads: sortThreadsByActivity(
          state.threads.map((candidate) => (candidate.id === thread.id ? nextThread : candidate)),
        ),
      };
    }),
  deleteRemoteThread: (threadId) =>
    set((state) => ({
      threads: state.threads.filter((thread) => thread.id !== threadId),
      pendingComments: state.pendingComments.filter((comment) => comment.threadId !== threadId),
    })),
  deleteRemoteComment: (commentId) =>
    set((state) => ({
      threads: sortThreadsByActivity(
        state.threads.map((thread) => {
          const comments = thread.comments.filter((comment) => comment.id !== commentId);
          return reviewThreadSchema.parse({
            ...thread,
            comments,
            latestActivityAt: latestUpdatedAt(comments, thread.updatedAt),
          });
        }),
      ),
      pendingComments: state.pendingComments.filter((comment) => comment.id !== commentId),
    })),
  removeForAnnotation: (annotationId) =>
    set((state) => ({
      threads: state.threads.filter((thread) => thread.annotationId !== annotationId),
    })),
  removeForAnnotations: (annotationIds) => {
    const removed = new Set(annotationIds);
    set((state) => ({
      threads: state.threads.filter((thread) => !removed.has(thread.annotationId)),
    }));
  },
  getByAnnotation: (annotationId) =>
    get().threads.find((thread) => thread.annotationId === annotationId) ?? null,
}));
