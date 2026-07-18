export type Point = {
  x: number;
  y: number;
};

export type Rectangle = Point & {
  width: number;
  height: number;
};

export type Arrow = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export type NodeBounds = Rectangle;

export type FlowViewport = {
  x: number;
  y: number;
  zoom: number;
};

function assertPositiveDimension(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
}

function assertPointPairs(points: number[]) {
  if (points.length % 2 !== 0) {
    throw new Error("Freehand points must contain x/y pairs.");
  }
}

/**
 * Converts a canvas-local screen pixel into React Flow coordinates.
 * The screen point must already have the canvas element's page offset removed.
 */
export function screenToFlowPosition(point: Point, viewport: FlowViewport): Point {
  assertPositiveDimension(viewport.zoom, "Viewport zoom");
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function flowToScreenPosition(point: Point, viewport: FlowViewport): Point {
  assertPositiveDimension(viewport.zoom, "Viewport zoom");
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function normalizePoint(point: Point, node: NodeBounds): Point {
  assertPositiveDimension(node.width, "Node width");
  assertPositiveDimension(node.height, "Node height");
  return {
    x: (point.x - node.x) / node.width,
    y: (point.y - node.y) / node.height,
  };
}

export function denormalizePoint(point: Point, node: NodeBounds): Point {
  assertPositiveDimension(node.width, "Node width");
  assertPositiveDimension(node.height, "Node height");
  return {
    x: node.x + point.x * node.width,
    y: node.y + point.y * node.height,
  };
}

export function screenToNodeRelativePosition(
  point: Point,
  node: NodeBounds,
  viewport: FlowViewport,
): Point {
  return normalizePoint(screenToFlowPosition(point, viewport), node);
}

export function nodeRelativeToScreenPosition(
  point: Point,
  node: NodeBounds,
  viewport: FlowViewport,
): Point {
  return flowToScreenPosition(denormalizePoint(point, node), viewport);
}

export function normalizeRectangle(rectangle: Rectangle, node: NodeBounds): Rectangle {
  const origin = normalizePoint(rectangle, node);
  return {
    ...origin,
    width: rectangle.width / node.width,
    height: rectangle.height / node.height,
  };
}

export function denormalizeRectangle(rectangle: Rectangle, node: NodeBounds): Rectangle {
  const origin = denormalizePoint(rectangle, node);
  return {
    ...origin,
    width: rectangle.width * node.width,
    height: rectangle.height * node.height,
  };
}

export function normalizeFreehandPoints(points: number[], node: NodeBounds): number[] {
  assertPointPairs(points);
  const normalized: number[] = [];
  for (let index = 0; index < points.length; index += 2) {
    const point = normalizePoint({ x: points[index], y: points[index + 1] }, node);
    normalized.push(point.x, point.y);
  }
  return normalized;
}

export function denormalizeFreehandPoints(points: number[], node: NodeBounds): number[] {
  assertPointPairs(points);
  const denormalized: number[] = [];
  for (let index = 0; index < points.length; index += 2) {
    const point = denormalizePoint({ x: points[index], y: points[index + 1] }, node);
    denormalized.push(point.x, point.y);
  }
  return denormalized;
}

export function normalizeArrow(arrow: Arrow, node: NodeBounds): Arrow {
  const start = normalizePoint({ x: arrow.startX, y: arrow.startY }, node);
  const end = normalizePoint({ x: arrow.endX, y: arrow.endY }, node);
  return {
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y,
  };
}

export function denormalizeArrow(arrow: Arrow, node: NodeBounds): Arrow {
  const start = denormalizePoint({ x: arrow.startX, y: arrow.startY }, node);
  const end = denormalizePoint({ x: arrow.endX, y: arrow.endY }, node);
  return {
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y,
  };
}
