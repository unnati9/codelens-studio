import { create } from "zustand";
import { annotationSchema, type Annotation } from "@/lib/validation/annotation";
import { shouldApplyVersionedRecord } from "@/lib/realtime/versioning";

type AnnotationStore = {
  boardId: string | null;
  annotations: Annotation[];
  initialize: (boardId: string, annotations: Annotation[]) => void;
  add: (annotation: Annotation) => void;
  replace: (annotation: Annotation) => void;
  upsertRemote: (annotation: Annotation) => void;
  deleteRemote: (annotationId: string) => void;
  update: (
    annotationId: string,
    updates: Partial<Pick<Annotation, "geometry" | "style" | "targetType" | "targetNodeId">>,
  ) => void;
  remove: (annotationId: string) => void;
  removeForNode: (nodeId: string) => void;
  get: (annotationId: string) => Annotation | null;
};

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  boardId: null,
  annotations: [],

  initialize: (boardId, annotations) =>
    set({
      boardId,
      annotations: annotations.map((annotation) => annotationSchema.parse(annotation)),
    }),

  add: (annotation) =>
    set((state) => {
      const parsed = annotationSchema.parse(annotation);
      return {
        annotations: state.annotations.some((candidate) => candidate.id === parsed.id)
          ? state.annotations.map((candidate) => (candidate.id === parsed.id ? parsed : candidate))
          : [...state.annotations, parsed],
      };
    }),

  replace: (annotation) =>
    set((state) => ({
      annotations: state.annotations.map((candidate) =>
        candidate.id === annotation.id ? annotationSchema.parse(annotation) : candidate,
      ),
    })),

  upsertRemote: (annotation) =>
    set((state) => {
      const parsed = annotationSchema.parse(annotation);
      if (state.boardId !== parsed.boardId) return state;
      const existing = state.annotations.find((candidate) => candidate.id === parsed.id);
      if (existing && !shouldApplyVersionedRecord(existing, parsed)) return state;
      return {
        annotations: existing
          ? state.annotations.map((candidate) => (candidate.id === parsed.id ? parsed : candidate))
          : [...state.annotations, parsed],
      };
    }),

  deleteRemote: (annotationId) =>
    set((state) => ({
      annotations: state.annotations.filter((annotation) => annotation.id !== annotationId),
    })),

  update: (annotationId, updates) =>
    set((state) => ({
      annotations: state.annotations.map((annotation) =>
        annotation.id === annotationId
          ? annotationSchema.parse({
              ...annotation,
              ...updates,
              updatedAt: new Date().toISOString(),
            })
          : annotation,
      ),
    })),

  remove: (annotationId) =>
    set((state) => ({
      annotations: state.annotations.filter((annotation) => annotation.id !== annotationId),
    })),

  removeForNode: (nodeId) =>
    set((state) => ({
      annotations: state.annotations.filter((annotation) => annotation.targetNodeId !== nodeId),
    })),

  get: (annotationId) =>
    get().annotations.find((annotation) => annotation.id === annotationId) ?? null,
}));
