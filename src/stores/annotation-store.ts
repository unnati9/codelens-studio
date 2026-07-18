import { create } from "zustand";
import { annotationSchema, type Annotation } from "@/lib/validation/annotation";

type AnnotationStore = {
  boardId: string | null;
  annotations: Annotation[];
  initialize: (boardId: string, annotations: Annotation[]) => void;
  add: (annotation: Annotation) => void;
  replace: (annotation: Annotation) => void;
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
    set((state) => ({ annotations: [...state.annotations, annotationSchema.parse(annotation)] })),

  replace: (annotation) =>
    set((state) => ({
      annotations: state.annotations.map((candidate) =>
        candidate.id === annotation.id ? annotationSchema.parse(annotation) : candidate,
      ),
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
