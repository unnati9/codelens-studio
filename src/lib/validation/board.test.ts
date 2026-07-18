import { describe, expect, it } from "vitest";
import { boardNodeSchema } from "./board";

const baseNode = {
  id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  board_id: "40ad7bd7-b5f4-4374-8c77-15219478ce2b",
  type: "code",
  title: "Review service",
  position_x: 120,
  position_y: 80,
  width: 480,
  height: 360,
  z_index: 1,
  locked: false,
  content: {
    kind: "code",
    filename: "review.ts",
    language: "typescript",
    code: "export const review = true;",
  },
  created_by: "guest-1",
  created_at: "2026-07-18T09:00:00.000Z",
  updated_at: "2026-07-18T09:00:00.000Z",
};

describe("boardNodeSchema", () => {
  it("accepts a valid code node", () => {
    expect(boardNodeSchema.parse(baseNode)).toMatchObject({ type: "code", width: 480 });
  });

  it("rejects content that does not match the node type", () => {
    const result = boardNodeSchema.safeParse({
      ...baseNode,
      content: {
        kind: "image",
        storagePath: null,
        fileName: null,
        mimeType: null,
        sizeBytes: null,
        naturalWidth: null,
        naturalHeight: null,
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects dimensions below the canvas minimum", () => {
    expect(boardNodeSchema.safeParse({ ...baseNode, width: 120 }).success).toBe(false);
  });
});
