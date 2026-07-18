import { describe, expect, it } from "vitest";
import {
  denormalizeArrow,
  denormalizeFreehandPoints,
  denormalizePoint,
  denormalizeRectangle,
  flowToScreenPosition,
  nodeRelativeToScreenPosition,
  normalizeArrow,
  normalizeFreehandPoints,
  normalizePoint,
  normalizeRectangle,
  screenToFlowPosition,
  screenToNodeRelativePosition,
  type NodeBounds,
} from "./coordinates";
import {
  annotationFromDatabaseRow,
  annotationToDatabaseRow,
  type Annotation,
} from "@/lib/validation/annotation";

const node: NodeBounds = { x: 100, y: 80, width: 400, height: 240 };
const tolerance = 8;

function expectNumbersClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], tolerance);
  });
}

describe("annotation coordinate model", () => {
  it("normalizes and denormalizes a point", () => {
    const normalized = normalizePoint({ x: 200, y: 200 }, node);
    expectNumbersClose([normalized.x, normalized.y], [0.25, 0.5]);

    const restored = denormalizePoint(normalized, node);
    expectNumbersClose([restored.x, restored.y], [200, 200]);
  });

  it("normalizes and denormalizes a rectangle", () => {
    const normalized = normalizeRectangle({ x: 140, y: 104, width: 200, height: 60 }, node);
    expectNumbersClose(
      [normalized.x, normalized.y, normalized.width, normalized.height],
      [0.1, 0.1, 0.5, 0.25],
    );

    const restored = denormalizeRectangle(normalized, node);
    expectNumbersClose(
      [restored.x, restored.y, restored.width, restored.height],
      [140, 104, 200, 60],
    );
  });

  it("normalizes and denormalizes an arrow", () => {
    const normalized = normalizeArrow({ startX: 120, startY: 104, endX: 420, endY: 272 }, node);
    expectNumbersClose(
      [normalized.startX, normalized.startY, normalized.endX, normalized.endY],
      [0.05, 0.1, 0.8, 0.8],
    );

    const restored = denormalizeArrow(normalized, node);
    expectNumbersClose(
      [restored.startX, restored.startY, restored.endX, restored.endY],
      [120, 104, 420, 272],
    );
  });

  it("normalizes and denormalizes freehand point pairs", () => {
    const points = [100, 80, 180, 140, 500, 320];
    const normalized = normalizeFreehandPoints(points, node);
    expectNumbersClose(normalized, [0, 0, 0.2, 0.25, 1, 1]);
    expectNumbersClose(denormalizeFreehandPoints(normalized, node), points);
  });

  it("keeps a node annotation aligned after the node moves", () => {
    const relative = { x: 0.25, y: 0.5 };
    const before = denormalizePoint(relative, node);
    const movedNode = { ...node, x: 360, y: -20 };
    const after = denormalizePoint(relative, movedNode);

    expectNumbersClose([before.x, before.y], [200, 200]);
    expectNumbersClose([after.x, after.y], [460, 100]);
    expectNumbersClose([after.x - before.x, after.y - before.y], [260, -100]);
  });

  it("keeps a node annotation proportional after the node resizes", () => {
    const relative = { x: 0.75, y: 0.25 };
    const resizedNode = { ...node, width: 800, height: 480 };

    const before = denormalizePoint(relative, node);
    const after = denormalizePoint(relative, resizedNode);
    expectNumbersClose([before.x, before.y], [400, 140]);
    expectNumbersClose([after.x, after.y], [700, 200]);
  });

  it("keeps a node annotation aligned after viewport zoom", () => {
    const relative = { x: 0.5, y: 0.5 };
    const screenAtOne = nodeRelativeToScreenPosition(relative, node, {
      x: 0,
      y: 0,
      zoom: 1,
    });
    const screenAtTwo = nodeRelativeToScreenPosition(relative, node, {
      x: 0,
      y: 0,
      zoom: 2,
    });

    expectNumbersClose([screenAtOne.x, screenAtOne.y], [300, 200]);
    expectNumbersClose([screenAtTwo.x, screenAtTwo.y], [600, 400]);
    expectNumbersClose(
      Object.values(screenToNodeRelativePosition(screenAtTwo, node, { x: 0, y: 0, zoom: 2 })),
      [relative.x, relative.y],
    );
  });

  it("keeps a node annotation aligned after viewport pan", () => {
    const relative = { x: 0.5, y: 0.5 };
    const viewport = { x: 175, y: -90, zoom: 1.25 };
    const screen = nodeRelativeToScreenPosition(relative, node, viewport);

    expectNumbersClose([screen.x, screen.y], [550, 160]);
    expectNumbersClose(Object.values(screenToNodeRelativePosition(screen, node, viewport)), [
      relative.x,
      relative.y,
    ]);

    const flow = screenToFlowPosition(screen, viewport);
    expectNumbersClose(Object.values(flowToScreenPosition(flow, viewport)), [screen.x, screen.y]);
  });

  it("preserves normalized geometry through a database save and reload", () => {
    const annotation: Annotation = {
      id: "109290e4-8094-4cba-9542-4a16e458c2d9",
      boardId: "9f739e0d-77dc-4ca0-9e1f-c444a9ec34a8",
      targetType: "NODE",
      targetNodeId: "32f4f51a-b9a0-4f44-b7db-e53b37f9ce02",
      tool: "RECTANGLE",
      geometry: { x: 0.125, y: 0.25, width: 0.5, height: 0.375 },
      style: { stroke: "#ff5a36", strokeWidth: 4, opacity: 0.85 },
      createdBy: "guest-test",
      createdAt: "2026-07-18T09:00:00.000Z",
      updatedAt: "2026-07-18T09:00:00.000Z",
    };

    const serialized = JSON.parse(JSON.stringify(annotationToDatabaseRow(annotation)));
    const reloaded = annotationFromDatabaseRow(serialized);
    expect(reloaded.targetType).toBe("NODE");
    expect(reloaded.targetNodeId).toBe(annotation.targetNodeId);
    expectNumbersClose(
      [
        reloaded.geometry.x ?? NaN,
        reloaded.geometry.y ?? NaN,
        reloaded.geometry.width ?? NaN,
        reloaded.geometry.height ?? NaN,
      ],
      [0.125, 0.25, 0.5, 0.375],
    );
  });
});
