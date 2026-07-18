import { describe, expect, it } from "vitest";
import { deserializeBoardNode, serializeBoardNode } from "./serialization";

const record = {
  id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  board_id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
  type: "code" as const,
  title: "Review service",
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

describe("board node serialization", () => {
  it("deserializes database geometry into a React Flow node", () => {
    const node = deserializeBoardNode(record);

    expect(node.position).toEqual({ x: 120, y: 80 });
    expect(node.style).toMatchObject({ width: 480, height: 360 });
    expect(node.data.record.content).toEqual(record.content);
  });

  it("serializes changed position and dimensions back to a record", () => {
    const node = deserializeBoardNode(record);
    const serialized = serializeBoardNode({
      ...node,
      position: { x: 310, y: 240 },
      style: { ...node.style, width: 640, height: 420 },
      zIndex: 4,
    });

    expect(serialized).toMatchObject({
      position_x: 310,
      position_y: 240,
      width: 640,
      height: 420,
      z_index: 4,
    });
  });

  it("prefers live React Flow measurements over stale controlled styles", () => {
    const node = deserializeBoardNode(record);
    const serialized = serializeBoardNode({
      ...node,
      measured: { width: 780, height: 510 },
      width: 780,
      height: 510,
      style: { ...node.style, width: 480, height: 360 },
    });

    expect(serialized).toMatchObject({ width: 780, height: 510 });
  });
});
