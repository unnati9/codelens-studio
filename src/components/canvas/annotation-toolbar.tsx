"use client";

import { useEffect } from "react";
import type { BoardFlowNode } from "@/lib/nodes/serialization";
import type { Annotation, AnnotationStyle } from "@/lib/validation/annotation";
import { useCanvasUiStore, type AnnotationInteractionTool } from "@/stores/canvas-ui-store";

const tools: Array<{ value: AnnotationInteractionTool; label: string; symbol: string }> = [
  { value: "SELECT", label: "Select", symbol: "↖" },
  { value: "FREEHAND", label: "Freehand", symbol: "〰" },
  { value: "RECTANGLE", label: "Rectangle", symbol: "□" },
  { value: "ARROW", label: "Arrow", symbol: "→" },
  { value: "HIGHLIGHT", label: "Highlight", symbol: "▰" },
];

type AnnotationToolbarProps = {
  nodes: BoardFlowNode[];
  selectedAnnotation: Annotation | null;
  onDelete: (annotationId: string) => Promise<void>;
  onDuplicate: (annotationId: string) => Promise<void>;
  onStyleChange: (annotationId: string, style: AnnotationStyle) => void;
};

export function AnnotationToolbar({
  nodes,
  selectedAnnotation,
  onDelete,
  onDuplicate,
  onStyleChange,
}: AnnotationToolbarProps) {
  const annotationTool = useCanvasUiStore((state) => state.annotationTool);
  const targetType = useCanvasUiStore((state) => state.annotationTargetType);
  const targetNodeId = useCanvasUiStore((state) => state.annotationTargetNodeId);
  const annotationStyle = useCanvasUiStore((state) => state.annotationStyle);
  const overlayOpacity = useCanvasUiStore((state) => state.annotationOverlayOpacity);
  const annotationsVisible = useCanvasUiStore((state) => state.annotationsVisible);
  const selectedAnnotationId = useCanvasUiStore((state) => state.selectedAnnotationId);

  useEffect(() => {
    if (!selectedAnnotationId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void onDelete(selectedAnnotationId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDelete, selectedAnnotationId]);

  const effectiveStyle = selectedAnnotation?.style ?? annotationStyle;

  function changeStyle(updates: Partial<AnnotationStyle>) {
    const nextStyle: AnnotationStyle = { ...effectiveStyle, ...updates };
    useCanvasUiStore.getState().setAnnotationStyle(nextStyle);
    if (selectedAnnotation) {
      onStyleChange(selectedAnnotation.id, nextStyle);
    }
  }

  const targetValue = targetType === "WORKSPACE" ? "WORKSPACE" : `NODE:${targetNodeId ?? ""}`;

  return (
    <div
      data-testid="annotation-toolbar"
      className="absolute left-1/2 top-4 z-[1100] flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-[#d8d3c8] bg-[#fffdf8]/95 p-2 shadow-[0_14px_35px_rgba(21,38,61,0.2)] backdrop-blur"
      role="toolbar"
      aria-label="Annotation tools"
    >
      <div className="flex items-center gap-1 border-r border-[#dedbd2] pr-2">
        {tools.map((tool) => (
          <button
            key={tool.value}
            type="button"
            data-testid={`annotation-tool-${tool.value.toLowerCase()}`}
            aria-label={tool.label}
            aria-pressed={annotationTool === tool.value}
            title={tool.label}
            onClick={() => useCanvasUiStore.getState().setAnnotationTool(tool.value)}
            className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-black transition ${
              annotationTool === tool.value
                ? "bg-[#15263d] text-white"
                : "text-[#4f5865] hover:bg-[#efede7]"
            }`}
          >
            {tool.symbol}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#767a82]">
        Target
        <select
          data-testid="annotation-target"
          value={targetValue}
          onChange={(event) => {
            if (event.target.value === "WORKSPACE") {
              useCanvasUiStore.getState().setAnnotationTarget("WORKSPACE");
              return;
            }
            useCanvasUiStore
              .getState()
              .setAnnotationTarget("NODE", event.target.value.replace("NODE:", ""));
          }}
          className="max-w-40 rounded-lg border border-[#d8d3c8] bg-white px-2 py-2 text-xs font-bold normal-case tracking-normal text-[#253348]"
        >
          <option value="WORKSPACE">Workspace</option>
          {nodes.map((node) => (
            <option key={node.id} value={`NODE:${node.id}`}>
              {node.data.record.title || `${node.type} node`}
            </option>
          ))}
        </select>
      </label>

      <label
        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-[#d8d3c8] bg-white"
        title="Stroke color"
      >
        <span
          className="h-5 w-5 rounded-full border border-black/10"
          style={{ background: effectiveStyle.stroke }}
        />
        <input
          aria-label="Stroke color"
          data-testid="annotation-stroke-color"
          type="color"
          value={effectiveStyle.stroke}
          onChange={(event) =>
            changeStyle({
              stroke: event.target.value,
              fill:
                selectedAnnotation?.tool === "HIGHLIGHT" || annotationTool === "HIGHLIGHT"
                  ? event.target.value
                  : effectiveStyle.fill,
            })
          }
          className="sr-only"
        />
      </label>

      <label
        className="flex items-center gap-1 text-[10px] font-bold text-[#6d727a]"
        title="Stroke width"
      >
        Width
        <input
          aria-label="Stroke width"
          data-testid="annotation-stroke-width"
          type="range"
          min="1"
          max="16"
          step="1"
          value={effectiveStyle.strokeWidth}
          onChange={(event) => changeStyle({ strokeWidth: Number(event.target.value) })}
          className="w-16 accent-[#ff5a36]"
        />
      </label>

      <label
        className="flex items-center gap-1 text-[10px] font-bold text-[#6d727a]"
        title="Ink opacity"
      >
        Ink
        <input
          aria-label="Annotation opacity"
          data-testid="annotation-opacity"
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={effectiveStyle.opacity}
          onChange={(event) => changeStyle({ opacity: Number(event.target.value) })}
          className="w-16 accent-[#ff5a36]"
        />
      </label>

      <label
        className="flex items-center gap-1 text-[10px] font-bold text-[#6d727a]"
        title="Tracing-paper opacity"
      >
        Paper
        <input
          aria-label="Tracing overlay opacity"
          data-testid="tracing-overlay-opacity"
          type="range"
          min="0"
          max="0.4"
          step="0.02"
          value={overlayOpacity}
          onChange={(event) =>
            useCanvasUiStore.getState().setAnnotationOverlayOpacity(Number(event.target.value))
          }
          className="w-16 accent-[#ff5a36]"
        />
      </label>

      <button
        type="button"
        data-testid="toggle-annotations"
        aria-pressed={annotationsVisible}
        onClick={() => useCanvasUiStore.getState().toggleAnnotationsVisible()}
        className="rounded-lg border border-[#d8d3c8] bg-white px-2.5 py-2 text-[10px] font-black text-[#4f5865]"
      >
        {annotationsVisible ? "Hide ink" : "Show ink"}
      </button>

      {selectedAnnotation && (
        <div className="flex gap-1 border-l border-[#dedbd2] pl-2">
          <button
            type="button"
            data-testid="duplicate-annotation"
            onClick={() => void onDuplicate(selectedAnnotation.id)}
            className="rounded-lg border border-[#d8d3c8] bg-white px-2.5 py-2 text-[10px] font-black text-[#4f5865]"
          >
            Duplicate
          </button>
          <button
            type="button"
            data-testid="delete-annotation"
            onClick={() => void onDelete(selectedAnnotation.id)}
            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] font-black text-red-700"
          >
            Delete
          </button>
        </div>
      )}

      <button
        type="button"
        data-testid="exit-annotation-mode"
        onClick={() => useCanvasUiStore.getState().exitAnnotationMode()}
        className="rounded-lg bg-[#ff5a36] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white"
      >
        Done
      </button>
    </div>
  );
}
