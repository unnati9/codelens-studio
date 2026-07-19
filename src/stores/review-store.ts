import { create } from "zustand";
import { sortThreadsByActivity } from "@/lib/review/threads";
import {
  reviewCommentSchema,
  reviewThreadSchema,
  type ReviewComment,
  type ReviewThread,
} from "@/lib/validation/review";

type ReviewStore = {
  boardId: string | null;
  threads: ReviewThread[];
  initialize: (boardId: string, threads: ReviewThread[]) => void;
  add: (thread: ReviewThread) => void;
  replace: (thread: ReviewThread) => void;
  addComment: (threadId: string, comment: ReviewComment) => void;
  removeForAnnotation: (annotationId: string) => void;
  removeForAnnotations: (annotationIds: string[]) => void;
  getByAnnotation: (annotationId: string) => ReviewThread | null;
};

export const useReviewStore = create<ReviewStore>((set, get) => ({
  boardId: null,
  threads: [],
  initialize: (boardId, threads) =>
    set({
      boardId,
      threads: sortThreadsByActivity(threads.map((thread) => reviewThreadSchema.parse(thread))),
    }),
  add: (thread) =>
    set((state) => ({
      threads: sortThreadsByActivity([...state.threads, reviewThreadSchema.parse(thread)]),
    })),
  replace: (thread) =>
    set((state) => ({
      threads: sortThreadsByActivity(
        state.threads.map((candidate) =>
          candidate.id === thread.id ? reviewThreadSchema.parse(thread) : candidate,
        ),
      ),
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
                  comments: [...thread.comments, parsedComment].sort(
                    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
                  ),
                  latestActivityAt: parsedComment.updatedAt,
                })
              : thread,
          ),
        ),
      };
    }),
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
