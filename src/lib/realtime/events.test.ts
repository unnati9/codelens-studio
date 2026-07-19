import { describe, expect, it } from "vitest";
import { parseBoardRealtimeChange } from "./events";

const boardId = "40ad7bd7-b5f4-4374-8c77-15219478ce2b";
const otherBoardId = "96d6b3d0-9daa-432e-a502-e58a9552f9b8";

const node = {
  id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  board_id: boardId,
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
  created_at: "2026-07-19T09:00:00.000Z",
  updated_at: "2026-07-19T09:00:00.000Z",
};

describe("board realtime event validation", () => {
  it("normalizes an active-board insert", () => {
    expect(
      parseBoardRealtimeChange("node", boardId, {
        eventType: "INSERT",
        new: node,
        old: {},
      }),
    ).toMatchObject({ entity: "node", action: "UPSERT", record: node });
  });

  it("rejects an upsert for another board", () => {
    expect(
      parseBoardRealtimeChange("node", boardId, {
        eventType: "UPDATE",
        new: { ...node, board_id: otherBoardId },
        old: node,
      }),
    ).toBeNull();
  });

  it("normalizes a comment with its board scope", () => {
    const change = parseBoardRealtimeChange("comment", boardId, {
      eventType: "INSERT",
      new: {
        id: "6a17bb87-f39c-45d5-aa58-e2d8e6e68714",
        board_id: boardId,
        thread_id: "9baad3f7-29e6-4921-b48b-b49f2d88ad5e",
        author_id: "guest-1",
        author_name: "Guest Reviewer",
        body: "Please check this.",
        created_at: "2026-07-19T09:01:00.000Z",
        updated_at: "2026-07-19T09:01:00.000Z",
      },
      old: {},
    });

    expect(change).toMatchObject({
      entity: "comment",
      action: "UPSERT",
      record: { boardId, body: "Please check this." },
    });
  });

  it("normalizes delete events from their primary key", () => {
    expect(
      parseBoardRealtimeChange("annotation", boardId, {
        eventType: "DELETE",
        new: {},
        old: { id: "e76c4401-f56c-42a7-a2c1-8a79da8645d3" },
      }),
    ).toEqual({
      entity: "annotation",
      action: "DELETE",
      id: "e76c4401-f56c-42a7-a2c1-8a79da8645d3",
    });
  });

  it("rejects malformed database payloads", () => {
    expect(() =>
      parseBoardRealtimeChange("node", boardId, {
        eventType: "UPDATE",
        new: { ...node, width: "not-a-number" },
        old: node,
      }),
    ).toThrow();
  });
});
