"use client";

import { useViewport } from "@xyflow/react";
import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  denormalizeArrow,
  denormalizeFreehandPoints,
  denormalizeRectangle,
  flowToScreenPosition,
  normalizeArrow,
  normalizeFreehandPoints,
  normalizeRectangle,
  screenToFlowPosition,
  type Arrow,
  type FlowViewport,
  type NodeBounds,
  type Point,
  type Rectangle,
} from "@/lib/annotations/coordinates";
import { getBoardFlowNodeDimensions, type BoardFlowNode } from "@/lib/nodes/serialization";
import type {
  Annotation,
  AnnotationGeometry,
  AnnotationStyle,
  AnnotationTargetType,
  AnnotationTool,
} from "@/lib/validation/annotation";
import type { AnnotationInteractionTool } from "@/stores/canvas-ui-store";

type DrawingDraft =
  | { tool: "FREEHAND"; points: number[] }
  | { tool: "RECTANGLE" | "HIGHLIGHT"; start: Point; current: Point }
  | { tool: "ARROW"; start: Point; current: Point };

type FlowGeometry =
  | { tool: "FREEHAND"; points: number[] }
  | { tool: "RECTANGLE" | "HIGHLIGHT"; rectangle: Rectangle }
  | { tool: "ARROW"; arrow: Arrow };

export type NewAnnotationInput = {
  targetType: AnnotationTargetType;
  targetNodeId?: string;
  tool: AnnotationTool;
  geometry: AnnotationGeometry;
  style: AnnotationStyle;
};

type AnnotationLayerProps = {
  nodes: BoardFlowNode[];
  annotations: Annotation[];
  annotationMode: boolean;
  activeTool: AnnotationInteractionTool;
  targetType: AnnotationTargetType;
  targetNodeId: string | null;
  style: AnnotationStyle;
  overlayOpacity: number;
  annotationsVisible: boolean;
  resolvedAnnotationIds?: ReadonlySet<string>;
  selectedAnnotationId: string | null;
  onCreate: (input: NewAnnotationInput) => void;
  onSelect: (annotationId: string | null) => void;
};

export function getNodeBounds(node: BoardFlowNode): NodeBounds {
  const dimensions = getBoardFlowNodeDimensions(node);
  return {
    x: node.position.x,
    y: node.position.y,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function pointInsideBounds(point: Point, bounds: NodeBounds) {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function clampPointToBounds(point: Point, bounds: NodeBounds): Point {
  return {
    x: Math.min(bounds.x + bounds.width, Math.max(bounds.x, point.x)),
    y: Math.min(bounds.y + bounds.height, Math.max(bounds.y, point.y)),
  };
}

function rectangleFromPoints(start: Point, end: Point): Rectangle {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function draftToFlowGeometry(draft: DrawingDraft): FlowGeometry {
  if (draft.tool === "FREEHAND") {
    return { tool: draft.tool, points: draft.points };
  }
  if (draft.tool === "ARROW") {
    return {
      tool: draft.tool,
      arrow: {
        startX: draft.start.x,
        startY: draft.start.y,
        endX: draft.current.x,
        endY: draft.current.y,
      },
    };
  }
  return {
    tool: draft.tool,
    rectangle: rectangleFromPoints(draft.start, draft.current),
  };
}

function annotationToFlowGeometry(
  annotation: Annotation,
  targetBounds: NodeBounds | undefined,
): FlowGeometry | null {
  const geometry = annotation.geometry;
  const isNodeTarget = annotation.targetType === "NODE";
  if (isNodeTarget && !targetBounds) return null;

  if (annotation.tool === "FREEHAND") {
    const points = geometry.points ?? [];
    return {
      tool: annotation.tool,
      points: isNodeTarget ? denormalizeFreehandPoints(points, targetBounds as NodeBounds) : points,
    };
  }

  if (annotation.tool === "ARROW") {
    const arrow: Arrow = {
      startX: geometry.startX ?? 0,
      startY: geometry.startY ?? 0,
      endX: geometry.endX ?? 0,
      endY: geometry.endY ?? 0,
    };
    return {
      tool: annotation.tool,
      arrow: isNodeTarget ? denormalizeArrow(arrow, targetBounds as NodeBounds) : arrow,
    };
  }

  const rectangle: Rectangle = {
    x: geometry.x ?? 0,
    y: geometry.y ?? 0,
    width: geometry.width ?? 0,
    height: geometry.height ?? 0,
  };
  return {
    tool: annotation.tool,
    rectangle: isNodeTarget
      ? denormalizeRectangle(rectangle, targetBounds as NodeBounds)
      : rectangle,
  };
}

function flowGeometryBounds(geometry: FlowGeometry): Rectangle {
  if (geometry.tool === "FREEHAND") {
    const xs = geometry.points.filter((_, index) => index % 2 === 0);
    const ys = geometry.points.filter((_, index) => index % 2 === 1);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    };
  }
  if (geometry.tool === "ARROW") {
    return rectangleFromPoints(
      { x: geometry.arrow.startX, y: geometry.arrow.startY },
      { x: geometry.arrow.endX, y: geometry.arrow.endY },
    );
  }
  return geometry.rectangle;
}

function pathFromScreenPoints(points: number[], viewport: FlowViewport) {
  const commands: string[] = [];
  for (let index = 0; index < points.length; index += 2) {
    const point = flowToScreenPosition({ x: points[index], y: points[index + 1] }, viewport);
    commands.push(`${index === 0 ? "M" : "L"} ${point.x} ${point.y}`);
  }
  return commands.join(" ");
}

function AnnotationShape({
  id,
  geometry,
  style,
  viewport,
  selected,
  selectable,
  resolved = false,
  onSelect,
}: {
  id: string;
  geometry: FlowGeometry;
  style: AnnotationStyle;
  viewport: FlowViewport;
  selected: boolean;
  selectable: boolean;
  resolved?: boolean;
  onSelect: () => void;
}) {
  const strokeWidth = Math.max(0.5, style.strokeWidth * viewport.zoom);
  const bounds = flowGeometryBounds(geometry);
  const boundsOrigin = flowToScreenPosition(bounds, viewport);
  const selectionBounds = {
    x: boundsOrigin.x - 6,
    y: boundsOrigin.y - 6,
    width: bounds.width * viewport.zoom + 12,
    height: bounds.height * viewport.zoom + 12,
  };
  const handlePointerDown = (event: ReactPointerEvent<SVGElement>) => {
    if (!selectable) return;
    event.stopPropagation();
    onSelect();
  };

  let shape;
  if (geometry.tool === "FREEHAND") {
    const path = pathFromScreenPoints(geometry.points, viewport);
    shape = (
      <>
        <path
          d={path}
          fill="none"
          stroke={style.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          onPointerDown={handlePointerDown}
          pointerEvents={selectable ? "stroke" : "none"}
        />
        {selectable && (
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(14, strokeWidth)}
            onPointerDown={handlePointerDown}
            pointerEvents="stroke"
          />
        )}
      </>
    );
  } else if (geometry.tool === "ARROW") {
    const start = flowToScreenPosition(
      { x: geometry.arrow.startX, y: geometry.arrow.startY },
      viewport,
    );
    const end = flowToScreenPosition({ x: geometry.arrow.endX, y: geometry.arrow.endY }, viewport);
    shape = (
      <>
        <defs>
          <marker
            id={`annotation-arrow-${id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={style.stroke} />
          </marker>
        </defs>
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={style.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          markerEnd={`url(#annotation-arrow-${id})`}
          onPointerDown={handlePointerDown}
          pointerEvents={selectable ? "stroke" : "none"}
        />
        {selectable && (
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="transparent"
            strokeWidth={Math.max(14, strokeWidth)}
            onPointerDown={handlePointerDown}
            pointerEvents="stroke"
          />
        )}
      </>
    );
  } else {
    const rectangle = geometry.rectangle;
    const origin = flowToScreenPosition(rectangle, viewport);
    const isHighlight = geometry.tool === "HIGHLIGHT";
    shape = (
      <rect
        x={origin.x}
        y={origin.y}
        width={rectangle.width * viewport.zoom}
        height={rectangle.height * viewport.zoom}
        rx={isHighlight ? 3 : 1}
        fill={isHighlight ? (style.fill ?? style.stroke) : "transparent"}
        stroke={style.stroke}
        strokeWidth={strokeWidth}
        onPointerDown={handlePointerDown}
        pointerEvents={selectable ? "all" : "none"}
      />
    );
  }

  return (
    <g data-testid={`annotation-${id}`}>
      <g opacity={style.opacity * (resolved ? 0.35 : 1)}>{shape}</g>
      {selected && (
        <rect
          data-testid="annotation-selection"
          x={selectionBounds.x}
          y={selectionBounds.y}
          width={Math.max(12, selectionBounds.width)}
          height={Math.max(12, selectionBounds.height)}
          fill="none"
          stroke="#15263d"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          pointerEvents="none"
        />
      )}
    </g>
  );
}

export function AnnotationLayer({
  nodes,
  annotations,
  annotationMode,
  activeTool,
  targetType,
  targetNodeId,
  style,
  overlayOpacity,
  annotationsVisible,
  resolvedAnnotationIds = new Set<string>(),
  selectedAnnotationId,
  onCreate,
  onSelect,
}: AnnotationLayerProps) {
  const viewport = useViewport();
  const [draft, setDraft] = useState<DrawingDraft | null>(null);
  const nodeBoundsById = useMemo(
    () => new Map(nodes.map((node) => [node.id, getNodeBounds(node)])),
    [nodes],
  );
  const targetBounds = targetNodeId ? nodeBoundsById.get(targetNodeId) : undefined;

  const localScreenPoint = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }, []);

  const flowPoint = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) =>
      screenToFlowPosition(localScreenPoint(event), viewport),
    [localScreenPoint, viewport],
  );

  const constrainPoint = useCallback(
    (point: Point) =>
      targetType === "NODE" && targetBounds ? clampPointToBounds(point, targetBounds) : point,
    [targetBounds, targetType],
  );

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!annotationMode || event.button !== 0) return;
    if (activeTool === "SELECT") {
      onSelect(null);
      return;
    }
    if (targetType === "NODE" && !targetBounds) return;

    const rawPoint = flowPoint(event);
    if (targetBounds && !pointInsideBounds(rawPoint, targetBounds)) return;
    const point = constrainPoint(rawPoint);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (activeTool === "FREEHAND") {
      setDraft({ tool: activeTool, points: [point.x, point.y, point.x, point.y] });
    } else {
      setDraft({ tool: activeTool, start: point, current: point });
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const point = constrainPoint(flowPoint(event));
    if (draft.tool === "FREEHAND") {
      const lastX = draft.points[draft.points.length - 2];
      const lastY = draft.points[draft.points.length - 1];
      if (Math.hypot(point.x - lastX, point.y - lastY) < 0.75 / viewport.zoom) return;
      setDraft({ ...draft, points: [...draft.points, point.x, point.y] });
      return;
    }
    setDraft({ ...draft, current: point });
  };

  const finishDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const flowGeometry = draftToFlowGeometry(draft);
    let geometry: AnnotationGeometry;
    if (flowGeometry.tool === "FREEHAND") {
      geometry = {
        points:
          targetType === "NODE" && targetBounds
            ? normalizeFreehandPoints(flowGeometry.points, targetBounds)
            : flowGeometry.points,
      };
    } else if (flowGeometry.tool === "ARROW") {
      geometry =
        targetType === "NODE" && targetBounds
          ? normalizeArrow(flowGeometry.arrow, targetBounds)
          : flowGeometry.arrow;
    } else {
      geometry =
        targetType === "NODE" && targetBounds
          ? normalizeRectangle(flowGeometry.rectangle, targetBounds)
          : flowGeometry.rectangle;
    }

    const screenBounds = flowGeometryBounds(flowGeometry);
    const hasSize =
      draft.tool === "FREEHAND" ||
      Math.hypot(screenBounds.width, screenBounds.height) * viewport.zoom >= 3;
    if (hasSize) {
      onCreate({
        targetType,
        targetNodeId: targetType === "NODE" ? (targetNodeId ?? undefined) : undefined,
        tool: draft.tool,
        geometry,
        style: {
          ...style,
          fill: draft.tool === "HIGHLIGHT" ? (style.fill ?? style.stroke) : style.fill,
        },
      });
    }
    setDraft(null);
  };

  const draftGeometry = draft ? draftToFlowGeometry(draft) : null;
  const targetScreenOrigin = targetBounds
    ? flowToScreenPosition(targetBounds, viewport)
    : undefined;

  return (
    <svg
      data-testid="annotation-layer"
      aria-label="Tracing-paper annotation layer"
      aria-hidden={!annotationsVisible}
      className={`absolute inset-0 z-[1000] h-full w-full touch-none ${
        annotationMode
          ? activeTool === "SELECT"
            ? "pointer-events-auto cursor-default"
            : "pointer-events-auto cursor-crosshair"
          : "pointer-events-none"
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrawing}
      onPointerCancel={() => setDraft(null)}
    >
      {annotationMode && (
        <rect
          data-testid="tracing-overlay"
          width="100%"
          height="100%"
          fill="#fffdf8"
          opacity={overlayOpacity}
        />
      )}

      {annotationMode && targetBounds && targetScreenOrigin && (
        <rect
          data-testid="annotation-target-outline"
          x={targetScreenOrigin.x}
          y={targetScreenOrigin.y}
          width={targetBounds.width * viewport.zoom}
          height={targetBounds.height * viewport.zoom}
          fill="none"
          stroke="#ff5a36"
          strokeWidth="2"
          strokeDasharray="8 5"
          pointerEvents="none"
        />
      )}

      {annotationsVisible &&
        annotations.map((annotation) => {
          const geometry = annotationToFlowGeometry(
            annotation,
            annotation.targetNodeId ? nodeBoundsById.get(annotation.targetNodeId) : undefined,
          );
          if (!geometry) return null;
          return (
            <AnnotationShape
              key={annotation.id}
              id={annotation.id}
              geometry={geometry}
              style={annotation.style}
              viewport={viewport}
              selected={selectedAnnotationId === annotation.id}
              selectable={!annotationMode || activeTool === "SELECT"}
              resolved={resolvedAnnotationIds.has(annotation.id)}
              onSelect={() => onSelect(annotation.id)}
            />
          );
        })}

      {draftGeometry && (
        <AnnotationShape
          id="draft"
          geometry={draftGeometry}
          style={style}
          viewport={viewport}
          selected={false}
          selectable={false}
          onSelect={() => undefined}
        />
      )}
    </svg>
  );
}
