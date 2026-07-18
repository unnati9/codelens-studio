import { create } from "zustand";
import type {
  AnnotationStyle,
  AnnotationTargetType,
  AnnotationTool,
} from "@/lib/validation/annotation";

export type SaveState = "idle" | "saving" | "saved" | "failed";
export type AnnotationInteractionTool = "SELECT" | AnnotationTool;

const defaultAnnotationStyle: AnnotationStyle = {
  stroke: "#ff5a36",
  strokeWidth: 4,
  opacity: 0.9,
};

type CanvasUiStore = {
  selectedNodeId: string | null;
  selectedAnnotationId: string | null;
  annotationMode: boolean;
  annotationTool: AnnotationInteractionTool;
  annotationTargetType: AnnotationTargetType;
  annotationTargetNodeId: string | null;
  annotationStyle: AnnotationStyle;
  annotationOverlayOpacity: number;
  annotationsVisible: boolean;
  saveState: SaveState;
  saveError: string | null;
  selectNode: (nodeId: string | null) => void;
  selectAnnotation: (annotationId: string | null) => void;
  enterAnnotationMode: (targetNodeId?: string | null) => void;
  exitAnnotationMode: () => void;
  setAnnotationTool: (tool: AnnotationInteractionTool) => void;
  setAnnotationTarget: (targetType: AnnotationTargetType, targetNodeId?: string | null) => void;
  setAnnotationStyle: (style: AnnotationStyle) => void;
  setAnnotationOverlayOpacity: (opacity: number) => void;
  toggleAnnotationsVisible: () => void;
  setSaveState: (saveState: SaveState, saveError?: string | null) => void;
  reset: () => void;
};

export const useCanvasUiStore = create<CanvasUiStore>((set) => ({
  selectedNodeId: null,
  selectedAnnotationId: null,
  annotationMode: false,
  annotationTool: "FREEHAND",
  annotationTargetType: "WORKSPACE",
  annotationTargetNodeId: null,
  annotationStyle: defaultAnnotationStyle,
  annotationOverlayOpacity: 0.12,
  annotationsVisible: true,
  saveState: "idle",
  saveError: null,
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
  selectAnnotation: (selectedAnnotationId) => set({ selectedAnnotationId }),
  enterAnnotationMode: (targetNodeId = null) =>
    set({
      annotationMode: true,
      annotationTargetType: targetNodeId ? "NODE" : "WORKSPACE",
      annotationTargetNodeId: targetNodeId,
      selectedAnnotationId: null,
    }),
  exitAnnotationMode: () =>
    set({
      annotationMode: false,
      selectedAnnotationId: null,
    }),
  setAnnotationTool: (annotationTool) => set({ annotationTool }),
  setAnnotationTarget: (annotationTargetType, targetNodeId = null) =>
    set({
      annotationTargetType,
      annotationTargetNodeId: annotationTargetType === "NODE" ? targetNodeId : null,
      selectedAnnotationId: null,
    }),
  setAnnotationStyle: (annotationStyle) => set({ annotationStyle }),
  setAnnotationOverlayOpacity: (annotationOverlayOpacity) => set({ annotationOverlayOpacity }),
  toggleAnnotationsVisible: () =>
    set((state) => ({ annotationsVisible: !state.annotationsVisible })),
  setSaveState: (saveState, saveError = null) => set({ saveState, saveError }),
  reset: () =>
    set({
      selectedNodeId: null,
      selectedAnnotationId: null,
      annotationMode: false,
      annotationTool: "FREEHAND",
      annotationTargetType: "WORKSPACE",
      annotationTargetNodeId: null,
      annotationStyle: defaultAnnotationStyle,
      annotationOverlayOpacity: 0.12,
      annotationsVisible: true,
      saveState: "idle",
      saveError: null,
    }),
}));
