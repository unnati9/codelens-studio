import { describe, expect, it } from "vitest";
import { applyNodeChanges } from "@xyflow/react";
import { denormalizeRectangle } from "@/lib/annotations/coordinates";
import { deserializeBoardNode, type BoardFlowNode } from "@/lib/nodes/serialization";
import { getNodeBounds } from "./annotation-layer";

const record = {
  id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  board_id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
  type: "code" as const,
  title: "Resize target",
  position_x: 120,
  position_y: 80,
  width: 480,
  height: 360,
  z_index: 1,
  locked: false,
  content: {
    kind: "code" as const,
    filename: "review.ts",
    language: "typescript" as const,
    code: "export const review = true;",
  },
  created_by: "guest-1",
  created_at: "2026-07-18T09:00:00.000Z",
  updated_at: "2026-07-18T09:00:00.000Z",
};

describe("annotation layer node bounds", () => {
  it("uses React Flow live measurements while a node is resizing", () => {
    const node = deserializeBoardNode(record);
    const [liveResizedNode] = applyNodeChanges<BoardFlowNode>(
      [
        {
          id: node.id,
          type: "dimensions",
          dimensions: { width: 960, height: 540 },
          setAttributes: true,
          resizing: true,
        },
      ],
      [node],
    );

    const bounds = getNodeBounds(liveResizedNode);
    const annotation = denormalizeRectangle({ x: 0.1, y: 0.2, width: 0.5, height: 0.25 }, bounds);

    expect(bounds).toEqual({ x: 120, y: 80, width: 960, height: 540 });
    expect(annotation).toEqual({ x: 216, y: 188, width: 480, height: 135 });
  });
});
